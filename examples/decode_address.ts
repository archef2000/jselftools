import ELFFile, { CompileUnit } from "../src";
import { Die } from "../src";
import * as fs from 'fs';
import { LineProgram } from "../src/lineprogram";

const elfData = fs.readFileSync('../owl.elf');
const address = 0x4200e8c6;
var start = Date.now();
const elffile = new ELFFile(elfData.buffer);
for (const section of elffile.body.sections) {
    if (section.type == "symtab") {
        console.log("symtab: " + section.name);
        var symtab_offset = Number(section.off);
        var symtab_size = Number(section.size);
        var symtab_entry_size = Number(section.entsize);
        var symtab_entry_count = Math.floor(symtab_size / symtab_entry_size);
        console.log("symtab_offset: " + symtab_offset + " size: " + symtab_size + " entry_size: " + symtab_entry_size + " entry_count: " + symtab_entry_count);
    }
}
console.log("new ELFFile: " + (Date.now() - start) + "ms");
const symtab = elffile.get_symtab();
const func_list: [number, number, string][] = [];
var start_symtab = Date.now();
if (symtab) {
    for (const symbol of symtab.iter_symbols()) {
        if (symbol.info.type == "STT_FUNC") {
            const start = Number(symbol.value);
            const end = start + Number(symbol.size);
            func_list.push([start, end, symbol.name]);
            if (Number(symbol.value) <= 0x4200e8c6 && 0x4200e8c6 < Number(symbol.value) + Number(symbol.size)) {
                console.log("funcname:", symbol.name);
                break;
            }
        }
    }
}
console.log("iter_symbols: " + (Date.now() - start_symtab) + "ms");
var func_list_sort_start = Date.now();
func_list.sort((a, b) => a[0] - b[0]);
console.log("func_list sort: " + (Date.now() - func_list_sort_start) + "ms");

var start_check_symbol = Date.now();
for (const [start, end, funcname] of func_list) {
    if (end < address) {
        continue;
    }
    if (start > address) { // already after the function
        break;
    }
    console.log("funcname:", funcname);

    //if (start <= address && address < end) { // without sorting
    //    break;
    //}
}
console.log("check_symbol: " + (Date.now() - start_check_symbol) + "ms"); // wihtout printing 11ms/1000 loops

console.log("from", func_list[0][0], "to", func_list[func_list.length - 1][1]);
start = Date.now();
var dwarfinfo = elffile.get_dwarf_info();
console.log("get_dwarf_info: " + (Date.now() - start) + "ms");
start = Date.now();
var CUs = dwarfinfo.get_CUs();
console.log("get_CUs: " + (Date.now() - start) + "ms");

var subprograms: Die[] = [];
var subprograms2: [number, number, string, CompileUnit][] = [];

function fill_subprogram() {
    for (const CU of CUs) {
        for (var die of CU.dies) {
            if (die.has_children) {
                for (var child of die.children) {
                    if (child.tag == "DW_TAG_subprogram") {
                        var low_pc = child.attributes["DW_AT_low_pc"];
                        var high_pc = child.attributes["DW_AT_high_pc"];
                        if (low_pc && low_pc.value > 0 && high_pc.value > 0 && child.attributes["DW_AT_name"]) {
                            subprograms.push(child);
                            subprograms2.push([low_pc.value, low_pc.value + high_pc.value, child.attributes["DW_AT_name"].value, CU]);
                        }
                    }
                }
            }
        }
    }
}

var fill_subprogram_start = Date.now();
fill_subprogram();
console.log("fill_subprogram: " + (Date.now() - fill_subprogram_start) + "ms");
var subprograms2_sort_start = Date.now();
subprograms2.sort((a, b) => a[0] - b[0]);
console.log("subprograms2 sort: " + (Date.now() - subprograms2_sort_start) + "ms");
var subprograms2_start = Date.now();
for (const [start, end, funcname, CU] of subprograms2) {
    if (end < address) {
        continue;
    }

    if (start > address) { // already after the function
        break;
    }
    console.log("funcname:", funcname);
    check_lineprog(dwarfinfo.line_program_for_CU(CU), address);

    /*
    if (start <= address && address < end) { // without sorting
        break;
    }
    */
}
console.log("subprograms2: " + (Date.now() - subprograms2_start) + "ms"); // wihtout printing 40ms/1000 loops

function check_lineprog(lineprog: LineProgram | null, address: number) {
    if (!lineprog) return;
    const delta = lineprog.header.version < 5 ? 1 : 0;
    var prevstate = null;
    for (var entry of lineprog.get_entries()) {
        if (entry.state === null) {
            continue;
        }
        if (prevstate && (prevstate.address <= address) && (address < entry.state.address)) {
            var filename = lineprog.header.file_entry[prevstate.file - delta];
            var line = prevstate.line;
            var directory = lineprog.header.include_directory[filename.dir_index - delta];
            console.log(directory + "/" + filename.name + ":" + line + prevstate.discriminator, prevstate.column);
            return true;
        }
        if (entry.state.end_sequence) {
            prevstate = null;
        } else {
            prevstate = entry.state;
        }
    }
    return false;
}

function check_address(die: Die, address: number) {
    try {
        var low_pc = die.attributes["DW_AT_low_pc"].value;
        var high_pc = die.attributes["DW_AT_high_pc"].value + low_pc;
        if ((low_pc <= address) && (address < high_pc)) {
            console.log(die.attributes["DW_AT_name"].value);
            // just check the lineprog for the CU of the die where the function name was found
            check_lineprog(dwarfinfo.line_program_for_CU(die.cu), address);
            return true;
        }
    } catch (error) { // TypeError
    }
    return false;
}

var function_name_start = Date.now();
for (var subprogram of subprograms) {
    check_address(subprogram, address);
}
console.log("check_address: " + (Date.now() - function_name_start) + "ms"); // without printing 165ms/1000 loops

var line_start = Date.now();
for (const CU of CUs) {
    var lineprog = dwarfinfo.line_program_for_CU(CU);
    check_lineprog(lineprog, address);
}
console.log("check_lineprog: " + (Date.now() - line_start) + "ms"); // without printing 441ms/1 loop
