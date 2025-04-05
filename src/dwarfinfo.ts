import { LineProgram, LineProgramHeader } from './lineprogram';
import CompileUnit from './compileunit';
import { readCString, readULEB128 } from './helpers';
import { ENUM_DW_LNCT, ENUM_DW_FORM } from './dwarf/enums';
import DWARFStructs from './structs';

type FormatFieldType = "file_name_entry_format" | "directory_entry_format";
type DataFieldType = "directories" | "file_names";

export default class DWARFInfo {
    CUs: CompileUnit[] = [];
    sections: { [key: string]: DataView };
    little_endian: boolean;
    dwarf_format: number;
    cu_die_offset: number;
    supplementary_dwarfinfo: boolean | any = false;

    constructor(sections: { [key: string]: DataView }, little_endian: boolean) {
        this.CUs = [];
        this.sections = sections;
        this.little_endian = little_endian;
        this.dwarf_format = 32;
        this.cu_die_offset = 0;
    }

    initial_length_field_size() {
        return this.dwarf_format == 32 ? 4 : 12;
    }

    get_CU_at_offset(offset: number) {
        // TODO: implement
        return new CompileUnit(this, offset);
    }

    parse_CUs() {
        var offset = 0;
        const initial_length_field_size = this.initial_length_field_size();
        while (offset < this.sections.debug_info_sec.byteLength) {
            const CU = this.get_CU_at_offset(offset);
            offset += Number(CU.unit_length) + initial_length_field_size;
            this.CUs.push(CU);
        }
        return this.CUs;
    }

    get_CUs() {
        if (this.CUs.length == 0) {
            this.CUs = this.parse_CUs();
        }
        return this.CUs;
    }

    line_program_for_CU(CU: CompileUnit) {
        var top_die = CU.dies[0];
        if ('DW_AT_stmt_list' in top_die.attributes) {
            if (!CU._line_program) {
                CU._line_program = this._parse_line_program_at_offset(top_die.attributes['DW_AT_stmt_list'].value, CU.structs);
            }
            return CU._line_program;
        }
        return null;
    }

    _parse_line_program_at_offset(offset: number, structs: DWARFStructs) {
        const line_str = this.sections.debug_line_sec;
        var { lineprog_header, offset: program_start_offset } = this.parse_line_header(offset, structs);
        this.resolve_strings(lineprog_header, 'directory_entry_format', 'directories');
        this.resolve_strings(lineprog_header, 'file_name_entry_format', 'file_names');
        if (lineprog_header.directories) {
            lineprog_header.include_directory = lineprog_header.directories.map(dir => dir.DW_LNCT_path);
        }
        if (lineprog_header.file_names) {
            lineprog_header.file_entry = lineprog_header.file_names.map(file => ({
                name: file.DW_LNCT_path,
                dir_index: Number(file.DW_LNCT_directory_index),
                mtime: Number(file.DW_LNCT_timestamp),
                length: Number(file.DW_LNCT_size)
            }));
        }

        const initial_length_field_size = 4 // if self.dwarf_format == 32 else 12
        const program_end_offset = (offset + lineprog_header['unit_length'] + initial_length_field_size);
        return new LineProgram(lineprog_header, program_start_offset, program_end_offset, this.sections.debug_line_sec, structs);
    }

    parse_line_header(offset: number, structs: DWARFStructs): { lineprog_header: LineProgramHeader, offset: number } {
        const debug_line_sec = this.sections.debug_line_sec;
        var lineprog_header: { [key: string]: any } = {};
        var [initial_length, offset] = structs.initial_length(debug_line_sec, offset);
        lineprog_header.unit_length = initial_length;
        lineprog_header.version = debug_line_sec.getUint16(offset, this.little_endian);
        offset += 2;
        if (lineprog_header.version >= 5) {
            lineprog_header.address_size = debug_line_sec.getUint8(offset++);
            lineprog_header.segment_selector_size = debug_line_sec.getUint8(offset++);
        }
        lineprog_header.header_length = debug_line_sec.getUint32(offset, this.little_endian);
        offset += 4;
        lineprog_header.minimum_instruction_length = debug_line_sec.getUint8(offset++);
        if (lineprog_header.version >= 4) {
            lineprog_header.maximum_operations_per_instruction = debug_line_sec.getUint8(offset++);
        }
        lineprog_header.default_is_stmt = debug_line_sec.getUint8(offset++);
        lineprog_header.line_base = debug_line_sec.getInt8(offset++);
        lineprog_header.line_range = debug_line_sec.getUint8(offset++);
        lineprog_header.opcode_base = debug_line_sec.getUint8(offset++);
        // Standard opcode lengths (an array of opcode_base-1 bytes)
        const standard_opcode_lengths = [];
        for (let i = 0; i < lineprog_header.opcode_base - 1; i++) {
            standard_opcode_lengths.push(debug_line_sec.getUint8(offset++));
        }
        lineprog_header.standard_opcode_lengths = standard_opcode_lengths;
        if (lineprog_header.version >= 5) {
            // directories
            const directory_entry_format_count = debug_line_sec.getUint8(offset++);
            var directory_entry_format = [];
            for (let i = 0; i < directory_entry_format_count; i++) {
                var [content_type, offset] = readULEB128(debug_line_sec, offset);
                var [form, offset] = readULEB128(debug_line_sec, offset);
                directory_entry_format.push({
                    content_type: ENUM_DW_LNCT[content_type as keyof typeof ENUM_DW_LNCT] || content_type,
                    form: ENUM_DW_FORM[form as keyof typeof ENUM_DW_FORM] || form
                });
            }
            lineprog_header.directory_entry_format = directory_entry_format;

            var [directories_count, offset] = readULEB128(debug_line_sec, offset);
            var directories = [];
            for (let i = 0; i < directories_count; i++) {
                let directory: { [key: string]: any } = {};
                for (let format of directory_entry_format) {
                    var { value, nextOffset: offset } = structs.Dwarf_dw_form(debug_line_sec, offset, format.form);
                    directory[format.content_type] = value;
                }
                directories.push(directory);
            }
            lineprog_header.directories = directories;

            // files
            const file_name_entry_format_count = debug_line_sec.getUint8(offset++);
            var file_name_entry_format = [];
            for (let i = 0; i < file_name_entry_format_count; i++) {
                var [content_type, offset] = readULEB128(debug_line_sec, offset);
                var [form, offset] = readULEB128(debug_line_sec, offset);
                file_name_entry_format.push({
                    content_type: ENUM_DW_LNCT[content_type as keyof typeof ENUM_DW_LNCT] || content_type,
                    form: ENUM_DW_FORM[form as keyof typeof ENUM_DW_FORM] || form
                });
            }
            lineprog_header.file_name_entry_format = file_name_entry_format;

            var [file_names_count, offset] = readULEB128(debug_line_sec, offset);
            var file_names = [];
            for (let i = 0; i < file_names_count; i++) {
                let entry: { [key: string]: any } = {};
                for (let format of file_name_entry_format) {
                    var { value, nextOffset: offset } = structs.Dwarf_dw_form(debug_line_sec, offset, format.form);
                    entry[format.content_type] = value;
                }
                file_names.push(entry);
            }
            lineprog_header.file_names = file_names;
        } else {
            // Legacy  directories/files - DWARF < 5 only
            lineprog_header.include_directory = [];
            while (true) {
                var { value: directory_name, nextOffset: offset } = readCString(debug_line_sec, offset);
                if (directory_name === '') break;
                lineprog_header.include_directory.push(directory_name);
            }
            lineprog_header.file_entry = [];
            while (true) {
                var { value: file_name, nextOffset: offset } = readCString(debug_line_sec, offset);
                if (file_name === '') break;
                var [dir_index, offset] = readULEB128(debug_line_sec, offset);
                var [mtime, offset] = readULEB128(debug_line_sec, offset);
                var [length, offset] = readULEB128(debug_line_sec, offset);
                lineprog_header.file_entry.push({ name: file_name, dir_index, mtime, length });
            }
        }
        var lineprog_header2 = lineprog_header as LineProgramHeader;
        return { lineprog_header: lineprog_header2, offset };
    }

    get_string_from_linetable(offset: number, sections: { [key: string]: DataView }) {
        return readCString(sections.debug_line_str_sec, offset).value;
    }

    get_string_from_table(offset: number, sections: { [key: string]: DataView }) {
        return readCString(sections.debug_str_sec, offset).value;
    }

    resolve_strings(lineprog_header: LineProgramHeader, format_field: FormatFieldType, data_field: DataFieldType) {
        if (lineprog_header[format_field]) {
            var data = lineprog_header[data_field];
            for (let field of lineprog_header[format_field]) {
                var replace_value = function (sections: { [key: string]: DataView }, data: { [key: string]: number | string }[], content_type: string | number, replacer: (x: number, y: { [key: string]: DataView }) => string) {
                    for (let entry of data) {
                        entry[content_type] = replacer(Number(entry[content_type]), sections);
                    }
                }
                if (field.form == 'DW_FORM_line_strp') {
                    replace_value(this.sections, data, field.content_type, this.get_string_from_linetable);
                } else if (field.form == 'DW_FORM_strp') {
                    replace_value(this.sections, data, field.content_type, this.get_string_from_table);
                } else if (field.form in ['DW_FORM_strp_sup', 'DW_FORM_GNU_strp_alt']) {
                    if (this.supplementary_dwarfinfo) {
                        replace_value(this.sections, data, field.content_type, this.supplementary_dwarfinfo.get_string_fromtable);
                    } else {
                        replace_value(this.sections, data, field.content_type, function (x: number, y) { return x.toString(); });
                    }
                } else if (field.form in ['DW_FORM_strp_sup', 'DW_FORM_strx', 'DW_FORM_strx1', 'DW_FORM_strx2', 'DW_FORM_strx3', 'DW_FORM_strx4']) {
                    throw new Error();
                }
            }
        }
    }

}


