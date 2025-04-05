import { constants } from './constants';
import { readCString, readULEB128, readSLEB128 } from './helpers';
import { ENUM_DW_LNCT, ENUM_DW_FORM } from './dwarf/enums';
import DWARFStructs from './structs';

export type DW_LNCT = typeof ENUM_DW_LNCT[keyof typeof ENUM_DW_LNCT];
export type DW_FORM = typeof ENUM_DW_FORM[keyof typeof ENUM_DW_FORM];

export interface LineProgramDirectories {[key: DW_LNCT]: string};
export interface LineProgramFileNames {[key: DW_LNCT]: string};

export interface LineProgramDirectoryEntry {
  form: DW_LNCT | number;
  content_type: DW_FORM | number;
}

export interface LineProgramFileEntry {
  name: string;
  dir_index: number;
  mtime: number;
  length: number;
}

export interface LineProgramHeader {
  unit_length: number;
  version: number;
  address_size?: number;
  segment_selector_size?: number;
  header_length: number;
  minimum_instruction_length: number;
  maximum_operations_per_instruction?: number;
  default_is_stmt: number;
  line_base: number;
  line_range: number;
  opcode_base: number;
  standard_opcode_lengths: number[];
  directory_entry_format?: LineProgramDirectoryEntry[];
  file_name_entry_format?: LineProgramDirectoryEntry[];
  directories: LineProgramDirectories[];
  file_entry: LineProgramFileEntry[];
  include_directory: string[];
  file_names: LineProgramFileNames[];
}

class LineProgramEntry {
  command: number;
  is_extended: boolean;
  args: number[]|{[key: string]: any};
  state: LineState|null;
  constructor(command: number, is_extended: boolean, args: number[]|{[key: string]: any}, state: LineState|null) {
    this.command = command;
    this.is_extended = is_extended;
    this.args = args;
    this.state = state;
  }
}

class LineState {
  address = 0;
  file = 1;
  line = 1;
  column = 0;
  op_index = 0;
  basic_block = false;
  end_sequence = false;
  prologue_end = false;
  epilogue_begin = false;
  isa = 0;
  discriminator = 0;
  is_stmt: number|boolean;
  constructor(default_is_stmt: number) {
    this.is_stmt = default_is_stmt;
  }
}

export class LineProgram {
  header: LineProgramHeader;
  program_start_offset: number;
  program_end_offset: number;
  stream: DataView;
  entries: LineProgramEntry[] = [];
  structs: DWARFStructs;
  
  constructor(header: LineProgramHeader, start_offset: number, end_offset: number, stream: DataView, structs: DWARFStructs) {
    this.header = header;
    this.program_start_offset = start_offset;
    this.program_end_offset = end_offset;
    this.stream = stream;
    this.structs = structs;
  }

  get_entries() {
    //return this._decode_line_program();
    if (this.entries.length == 0) {
      this.entries = this._decode_line_program();
    }
    return this.entries;
  };
  _decode_line_program() {
    var entries: LineProgramEntry[] = [];
    var state = new LineState(this.header['default_is_stmt']);

    function add_entry_new_state(cmd: number, args: number[], is_extended: boolean = false) {
      // Add an entry that sets a new state.
      // After adding, clear some state registers.
      entries.push(new LineProgramEntry(
        cmd, is_extended, args, {... state}));
      state.discriminator = 0;
      state.basic_block = false;
      state.prologue_end = false;
      state.epilogue_begin = false;
    }

    function add_entry_old_state(cmd: number, args: number[]|{[key: string]: any}, is_extended: boolean = false) {
      // Add an entry that doesn't visibly set a new state
      entries.push(new LineProgramEntry(cmd, is_extended, args, null));
    }

    offset = this.program_start_offset;
    while (offset < this.program_end_offset) {
      var opcode = this.stream.getUint8(offset++);
      var operand: number | BigInt;
      if(opcode >= this.header['opcode_base']) {
        // Special opcode (follow the recipe in 6.2.5.1)
        const maximum_operations_per_instruction = this.header.maximum_operations_per_instruction || 1; // TODO: check if this is correct
        const adjusted_opcode = opcode - this.header.opcode_base;
        const operation_advance = adjusted_opcode / this.header.line_range;
        const address_addend = (
          this.header.minimum_instruction_length * 
          Math.floor((state.op_index + operation_advance) / maximum_operations_per_instruction)
        );
        state.address += address_addend;
        state.op_index = (state.op_index + operation_advance) % maximum_operations_per_instruction;
        var line_addend = this.header.line_base + (adjusted_opcode % this.header.line_range);
        state.line += line_addend;
        add_entry_new_state(
          opcode, [line_addend, address_addend, state.op_index])
      } else if (opcode == 0) {
        // Extended opcode: start with a zero byte, followed by
        // instruction size and the instruction itself.
        var [ inst_len, offset ] = readULEB128(this.stream, offset); 
        const ex_opcode = this.stream.getUint8(offset++);

        if (ex_opcode == constants.DW_LNE_end_sequence) {
          state.end_sequence = true;
          state.is_stmt = 0;
          add_entry_new_state(ex_opcode, [], true);
          // reset state
          state = new LineState(this.header['default_is_stmt']);
        } else if (ex_opcode == constants.DW_LNE_set_address) {
          var [operand, offset] = this.structs.Dwarf_offset(this.stream, offset);
          state.address = Number(operand);
          add_entry_old_state(ex_opcode, [operand], true);
        } else if (ex_opcode == constants.DW_LNE_define_file) {
          var { value: file_name, nextOffset: offset } = readCString(this.stream, offset);
          if (file_name === '') break;
          var [dir_index, offset ] = readULEB128(this.stream, offset);
          var [mtime, offset ] = readULEB128(this.stream, offset);
          var [length, offset ] = readULEB128(this.stream, offset);
          var file_operand = { name: file_name, dir_index, mtime, length };
          this.header.file_entry.push(file_operand);
          add_entry_old_state(ex_opcode, [file_operand], true);
        } else if (ex_opcode == constants.DW_LNE_set_discriminator) {
          [operand, offset] = readULEB128(this.stream, offset);
          state.discriminator = operand;
        } else {
          // Unknown, but need to roll forward the stream because the
          // length is specified. Seek forward inst_len - 1 because
          // we've already read the extended opcode, which takes part
          // in the length.
          offset += inst_len - 1;
        }
      } else { // 0 < opcode < opcode_base
        // Standard opcode
        if (opcode == constants.DW_LNS_copy) {
          add_entry_new_state(opcode, []);
        } else if (opcode == constants.DW_LNS_advance_pc) {
          [operand, offset ] = readULEB128(this.stream, offset);
          var address_addend = (operand * this.header.minimum_instruction_length);
          state.address += address_addend;
          add_entry_old_state(opcode, [address_addend]);
        } else if (opcode == constants.DW_LNS_advance_line) {
          [operand, offset ] = readSLEB128(this.stream, offset);
          state.line += operand;
        } else if (opcode == constants.DW_LNS_set_file) {
          [operand, offset] = readULEB128(this.stream, offset);
          state.file = operand;
          add_entry_old_state(opcode, [operand]);
        } else if (opcode == constants.DW_LNS_set_column) {
          [operand, offset ] = readULEB128(this.stream, offset);
          state.column = operand;
          add_entry_old_state(opcode, [operand]);
        } else if (opcode == constants.DW_LNS_negate_stmt) {
          state.is_stmt = !state.is_stmt;
          add_entry_old_state(opcode, []);
        } else if (opcode == constants.DW_LNS_set_basic_block) {
          state.basic_block = true;
          add_entry_old_state(opcode, []);
        } else if (opcode == constants.DW_LNS_const_add_pc) {
          var adjusted_opcode = 255 - this.header.opcode_base;
          const address_addend = (
            Math.floor(adjusted_opcode / this.header.line_range) * this.header.minimum_instruction_length
          );
          state.address += address_addend;
          add_entry_old_state(opcode, [address_addend]);
        } else if (opcode == constants.DW_LNS_fixed_advance_pc) {
          operand = this.stream.getUint16(offset, this.structs.little_endian);
          offset += 2;
          state.address += operand;
          add_entry_old_state(opcode, [operand]);
        } else if (opcode == constants.DW_LNS_set_prologue_end) {
          state.prologue_end = true;
          add_entry_old_state(opcode, []);
        } else if (opcode == constants.DW_LNS_set_epilogue_begin) {
          state.epilogue_begin = true;
          add_entry_old_state(opcode, []);
        } else if (opcode == constants.DW_LNS_set_isa) {
          [operand, offset] = readULEB128(this.stream, offset);
          state.isa = operand;
          add_entry_old_state(opcode, [operand]);
        } else {
          throw new Error("Invalid standard line program opcode: " + opcode);
        }
      }
    }
    return entries;
  }
  
}