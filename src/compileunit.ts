import Die from './die';
import { ENUM_DW_TAG, ENUM_DW_AT, ENUM_DW_FORM, ENUM_DW_UT } from './dwarf/enums';
import DWARFInfo from './dwarfinfo';
import { LineProgram } from './lineprogram';
import DWARFStructs from './structs';
import { readULEB128 } from './helpers';

export interface AbbrevTable { [key: number]: { tag: string | number, has_children: boolean, attributes: any[] } };

export default class CompileUnit {
    unit_length: number | BigInt;
    version: number;
    dies: Die[] = []; // new Array(500); // 
    dwarfinfo: DWARFInfo;
    offset: number;
    _line_program: LineProgram | null = null;
    cu_end_offset: number;
    unit_type?: string;
    address_size: number;
    debug_abbrev_offset: number;
    debug_info_offset?: BigInt;
    type_signature?: BigInt;
    type_offset?: number;
    abbrev_table: AbbrevTable = {};
    cu_die_offset: number;
    dwarf_formet: number;
    structs: DWARFStructs;

    constructor(dwarfinfo: DWARFInfo, offset: number) {
        this.dwarfinfo = dwarfinfo;
        this.offset = offset;
        const data = dwarfinfo.sections.debug_info_sec;
        const isLE = dwarfinfo.little_endian;
        var offset = this.offset;
        this.unit_length = data.getUint32(offset, dwarfinfo.little_endian);
        offset += 4;
        this.dwarf_formet = this.unit_length === 0xffffffff ? 64 : 32;
        if (this.dwarf_formet === 64) {
            this.unit_length = data.getBigUint64(offset, dwarfinfo.little_endian);
            offset += 8;
        }
        this.cu_end_offset = this.offset + Number(this.unit_length) + 4; // TODO: initial_length_field_size
        this.version = data.getUint16(offset, isLE);
        offset += 2;
        if (this.version >= 5) {
            this.unit_type = ENUM_DW_UT[data.getUint8(offset++) as keyof typeof ENUM_DW_UT];

            this.address_size = data.getUint8(offset++);
            this.debug_abbrev_offset = data.getUint32(offset, isLE);
            offset += 4;
            switch (this.unit_type) {
                case 'DW_UT_compile':
                case 'DW_UT_partial':
                    break;
                case 'DW_UT_skeleton':
                case 'DW_UT_split_compile':
                    this.debug_info_offset = data.getBigUint64(offset, isLE);
                    offset += 8;
                    break;
                case 'DW_UT_type':
                case 'DW_UT_split_type':
                    this.type_signature = data.getBigUint64(offset, isLE);
                    offset += 8;
                    this.type_offset = data.getUint32(offset, isLE);
                    offset += 4;
                    break;
                default:
                    throw new Error("Unknown CU type");
            }
        } else {
            this.debug_abbrev_offset = data.getUint32(offset, isLE);
            offset += 4;
            this.address_size = data.getUint8(offset++);
        }
        this.structs = new DWARFStructs(dwarfinfo.little_endian, this.dwarf_formet, this.address_size, this.version);
        this.cu_die_offset = offset;
        this.abbrev_table = this._parse_abbrev_table(); // ca. 25ms/1000
        while (offset < this.cu_end_offset) { // 0-1ms/1000
            const die = new Die(this, offset);
            offset += die.size;
            this.dies.push(die);
        }
    }

    get_abbrev_table() {
        if (!this.abbrev_table) {
            this.abbrev_table = this._parse_abbrev_table();
        }
        return this.abbrev_table;
    }

    _parse_abbrev_table() {
        const buffer = this.dwarfinfo.sections.debug_abbrev_sec;
        var offset = this.debug_abbrev_offset;
        let abbrev_table: AbbrevTable = {};

        while (offset < buffer.byteLength) {
            var [decl_code, offset] = readULEB128(buffer, offset);

            if (decl_code === 0) {
                break;
            }
            var [value, offset] = readULEB128(buffer, offset);
            var tag: string | number = ENUM_DW_TAG[Number(value) as keyof typeof ENUM_DW_TAG] || value;
            const has_children = buffer.getUint8(offset++) == 1;

            let attributes = [];
            var form: string | number;
            var name: string | number;
            while (true) {
                [name, offset] = readULEB128(buffer, offset);
                [form, offset] = readULEB128(buffer, offset);
                if (name === 0 && form === 0) break; // Terminator
                name = ENUM_DW_AT[Number(name) as keyof typeof ENUM_DW_AT] || name;
                form = ENUM_DW_FORM[Number(form) as keyof typeof ENUM_DW_FORM] || form;
                if (form == "DW_FORM_implicit_const") {
                    var [value, offset] = readULEB128(buffer, offset);
                    attributes.push({ name, form, value });
                } else {
                    attributes.push({ name, form });
                }
            }
            abbrev_table[decl_code] = { tag, has_children, attributes };
        }
        return abbrev_table;
    }
}