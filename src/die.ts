import { readCString, readULEB128 } from './helpers';
import CompileUnit from './compileunit';
import DWARFInfo from './dwarfinfo';
import {DW_FORM} from './lineprogram';

export default class Die {
    size: number = 0;
    cu: CompileUnit;
    dwarfinfo: DWARFInfo;
    children: Die[] = [];
    null_entry: boolean = false;
    attributes: {[key: string]: {value: any, form: string, name: string}} = {};
    offset: number;
    tag: string | number = 0;
    has_children: boolean = false;

    constructor(cu: CompileUnit, offset: number) {
        this.dwarfinfo = cu.dwarfinfo;
        this.offset = offset;
        this.cu = cu;
        this.attributes = {};
        this._parse_DIE();
    }

    _parse_DIE() {
        var data = this.dwarfinfo.sections.debug_info_sec;
        var offset = this.offset;
        var [ abbrev_code, offset ] = readULEB128(data, offset)
        if (abbrev_code === 0) {
            // End of the current DIE list (null entry)
            this.size = offset - this.offset;
            this.null_entry = true;
            return;
        }

        // Lookup abbreviation entry (abbrev_code -> {tag, has_children, attributes})
        const abbrev_decl = this.cu.abbrev_table[abbrev_code];
        if (!abbrev_decl) {
            throw new Error(`Unknown abbreviation code: ${abbrev_code.toString(16)} at offset ${offset}`);
        }
        this.tag = abbrev_decl.tag;
        this.has_children = abbrev_decl.has_children;

        for (const { name, form, value } of abbrev_decl.attributes) {
            if (form == "DW_FORM_implicit_const") {
                this.attributes[name] = { value, form, name };
            } else { // TODO: DW_FORM_indirect
                var { value: attrValue, nextOffset: offset } = this.cu.structs?.Dwarf_dw_form(data, offset, form);
                var newValue = this._translate_attr_value(this.cu, form, attrValue);
                this.attributes[name] = { value: newValue, form, name };
            }
        }
        
        if (this.has_children) {
            while (true) {
                const die = new Die(this.cu, offset);
                offset += die.size;
                if (die.null_entry) break; // Reached a null entry → End of children
                this.children.push(die);
            }
        }
        this.size = offset - this.offset;
    }
    repr() {
        return Object.fromEntries(Object.entries(this)
                    .filter(([key]) => !["dwarfinfo", "cu"].includes(key)));
    }
    _translate_attr_value(cu: CompileUnit, form: DW_FORM, raw_value: any) {
        var translate_indirect = false // self.cu.has_top_DIE() or self.offset != self.cu.cu_die_offset
        if (form == 'DW_FORM_strp') {
            return readCString(this.dwarfinfo.sections.debug_str_sec, raw_value).value;
        } else if (form == 'DW_FORM_line_strp') {
            return readCString(this.dwarfinfo.sections.debug_line_str_sec, raw_value).value;
        /*
        } else if (form in ['DW_FORM_GNU_strp_alt', 'DW_FORM_strp_sup'] && this.dwarfinfo.supplementarydwarfinfo) {
            return this.dwarfinfo.supplementarydwarfinfo.get_string_fromtable(raw_value);
        */
        } else if (form == 'DW_FROM_flag') {
            return !(raw_value == 0);
        } else if (form == 'DW_FORM_flag_present') {
            return true;
        }
        // TODO: not needed for esp idf
        //else if (form in ('DW_FORM_addrx', 'DW_FORM_addrx1', 'DW_FORM_addrx2', 'DW_FORM_addrx3', 'DW_FORM_addrx4') && translate_indirect) {
        //  return dwarfinfo.get_addr(cu, raw_value);
        //} else if (form in ('DW_FORM_strx', 'DW_FORM_strx1', 'DW_FORM_strx2', 'DW_FORM_strx3', 'DW_FORM_strx4') && translate_indirect) {
        //  //stream = self.dwarfinfo.sections.debug_str_offsets_sec.stream;
        //  //base_offset = _get_base_offset(self.cu, 'DW_AT_str_offsets_base');
        //  //offset_size = 4 if cu.structs.dwarf_format == 32 else 8;
        //  //str_offset = struct_parse(self.cu.structs.the_Dwarf_offset, stream, base_offset + raw_value*offset_size)
        //  //return self.dwarfinfo.get_string_from_table(str_offset)
        //} else if (form == 'DW_FORM_loclistx' && translate_indirect) {
        //  return _resolve_via_offset_table(dwarfinfo.sections.debug_loclists_sec.stream, cu, raw_value, 'DW_AT_loclists_base');
        //} else if (form == 'DW_FORM_rnglistx' && translate_indirect) {
        //  return _resolve_via_offset_table(dwarfinfo.sections.debug_rnglists_sec.stream, cu, raw_value, 'DW_AT_rnglists_base');
        //}
        return raw_value
    }


    get_children() {
        return this.children;
    }
}