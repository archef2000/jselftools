import { ElfHeader } from './elffile';
import { readULEB128, readSLEB128, readCString } from './helpers';

export default class DWARFStructs {
    little_endian: boolean;
    dwarf_format: number;
    address_size: number;
    dwarf_version: number;

    constructor(little_endian: boolean, dwarf_format: number, address_size: number, dwarf_version: number) {
        this.little_endian = little_endian;
        this.dwarf_format = dwarf_format;
        this.address_size = address_size;
        this.dwarf_version = dwarf_version;
    }

    Dwarf_offset(data: DataView, offset: number): [number|BigInt, number] {
        if (this.dwarf_format == 32) {
            return [data.getUint32(offset, true), offset + 4];
        } else {
            return [data.getBigUint64(offset, true), offset + 8];
        }
    }

    readUint24LE(dataView: DataView, offset: number): number {
        if (offset < 0 || offset + 3 > dataView.byteLength) {
            throw new RangeError("Offset out of bounds");
        }
    
        // Read 3 bytes and construct the 24-bit number
        return (
            dataView.getUint8(offset) |            // Least significant byte
            (dataView.getUint8(offset + 1) << 8) | // Middle byte
            (dataView.getUint8(offset + 2) << 16)  // Most significant byte
        );
    }
    

    Dwarf_target_addr(data: DataView, offset: number): [any, number] {
        if (this.address_size == 4) {
            return [data.getUint32(offset, true), offset + 4];
        } else {
            return [data.getBigUint64(offset, true), offset + 8];
        }
    }

    initial_length(data: DataView, offset: number): [number|BigInt, number] {
        var initial_length = data.getUint32(offset, true);
        if (initial_length == 0xFFFFFFFF) {
            return [data.getBigUint64(offset+4, true), offset + 12];
        } else {
            return [initial_length, offset + 4];
        }
    }

    Dwarf_dw_form(data: DataView, offset: number, form: string | number): { value: number | BigInt | ArrayBuffer | string | boolean | undefined, nextOffset: number } {
        var value: number | BigInt | ArrayBuffer | string | boolean | undefined = undefined;
        var length: number;
        switch (form) {
            case "DW_FORM_addr": // target address
                [value, offset] = this.Dwarf_target_addr(data, offset);
                break;
            case "DW_FORM_addrx4":
            case "DW_FORM_data4":
            case "DW_FORM_ref":
            case "DW_FORM_ref4":
            case "DW_FORM_ref_sup4":
                value = data.getUint32(offset, true); // 4-byte or 8-byte address, assuming 4-byte for 32bit
                offset += 4;
                break;
            case "DW_FORM_addrx":
            case "DW_FORM_udata":
            case "DW_FORM_ref_udata":
            case "DW_FORM_indirect":
            case "DW_AT_GNU_all_call_sites":
            // New forms in DWARFv5
            case "DW_FORM_loclistx":
            case "DW_FORM_rnglistx":
                [value, offset] = readULEB128(data, offset);
                break;
            case "DW_FORM_addrx1":
            case "DW_FORM_data1":
            case "DW_FORM_strx1":
            case "DW_FORM_flag":
            case "DW_FORM_ref1":
                value = data.getUint8(offset++);
                break;
            case "DW_FORM_addrx2":
            case "DW_FORM_data2":
            case "DW_FORM_strx2":
            case "DW_FORM_ref2":
                value = data.getUint16(offset, true);
                offset += 2;
                break;
            case "DW_FORM_addrx3":
            case "DW_FORM_strx3":
                value = this.readUint24LE(data, offset);
                offset += 3;
                break;
            case "DW_FORM_block1":
                length = data.getUint8(offset++);
                value = data.buffer.slice(offset, offset + length);
                offset += length;
                break;
            case "DW_FORM_block2":
                length = data.getUint16(offset, true);
                offset += 2;
                value = data.buffer.slice(offset, offset + length);
                offset += length;
                break;
            case "DW_FORM_block4":
                length = data.getUint32(offset, true);
                offset += 4;
                value = data.buffer.slice(offset, offset + length);
                offset += length;
                break;
            case "DW_FORM_block8":
                length = Number(data.getBigUint64(offset, true));
                offset += 8;
                value = data.buffer.slice(offset, offset + length);
                offset += length;
                break;
            case "DW_FORM_block":
            case "DW_FORM_exprloc":
                var [length, offset ] = readULEB128(data, offset);
                value = data.buffer.slice(offset, offset + length);
                offset += length;
                break;
            case "DW_FORM_data8":
            case "DW_FORM_strx4":
            case "DW_FORM_ref8":
            case "DW_FORM_ref_sup8":
            case "DW_FORM_ref_sig8":
                value = Number(data.getBigUint64(offset, this.little_endian));
                offset += 8;
                break;
            case "DW_FORM_data16":
                value = data.buffer.slice(offset, offset + 16);
                offset += 16;
                break;
            case "DW_FORM_sdata":
                [value,  offset ] = readSLEB128(data, offset);
                break;
            case "DW_FORM_string":
                var { value: stringValue, nextOffset: offset } = readCString(data, offset);
                value = stringValue;
                break;
            case "DW_FORM_strp":
            case "DW_FORM_strp_sup":
            case "DW_FORM_line_strp":
            case "DW_FORM_sec_offset":
            case "DW_FORM_GNU_strp_alt":
            case "DW_FORM_GNU_ref_alt":
                [value, offset] = this.Dwarf_offset(data, offset);
                break;
            case "DW_FORM_ref_addr": // switch for v2 is a target address
                if (this.dwarf_version == 2) {
                    [value, offset] = this.Dwarf_target_addr(data, offset);
                } else {
                    [value, offset] = this.Dwarf_offset(data, offset);
                }
                break;
            case "DW_FORM_implicit_const":
                // Treated separatedly while parsing, but here so that all forms resovle
                break;
            // New forms in DWARFv4
            case "DW_FORM_flag_present":
                value = true;
                break;
            default:
                throw new Error(`Unknown attribute form: ${form}`);
        }
        return { value, nextOffset: offset };
    }


}

export class ELFStructs {
    isLE: boolean;
    is32: boolean;

    constructor(elfHeader: ElfHeader) {
        this.isLE = elfHeader.isLE;
        this.is32 = elfHeader.class == "32";
    }

    read_word(data: DataView, offset: number): [number, number] {
        return [data.getUint32(offset, this.isLE), offset+4];
    }

    read_half(data: DataView, offset: number): [number, number] {
        return [data.getUint16(offset, this.isLE), offset+2];
    }

    read_sword(data: DataView, offset: number): [number, number] {
        return [data.getInt32(offset, this.isLE), offset+2];
    }

    read_addr(data: DataView, offset: number): [BigInt|number, number] {
        if (this.is32) {
            return [data.getUint32(offset, this.isLE), offset+4];
        } else {
            return [data.getBigUint64(offset, this.isLE), offset+8];
        }
    }
    read_offset(data: DataView, offset: number): [BigInt|number, number] {
        return this.read_addr(data, offset);
    }
}