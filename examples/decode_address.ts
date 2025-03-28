import ELFFile from "../src";
import {Die} from "../src";
import * as fs from 'fs';
import { LineProgram } from "../src/lineprogram";

const elfData = fs.readFileSync('../owl.elf');
const address = 0x4200e8c6;
var start = Date.now();
const elffile = new ELFFile(elfData.buffer);
console.log("new ELFFile: " + (Date.now() - start) + "ms");
start = Date.now();
var dwarfinfo = elffile.get_dwarf_info();
console.log("get_dwarf_info: " + (Date.now() - start) + "ms");
start = Date.now();
var CUs = dwarfinfo.get_CUs();
console.log("get_CUs: " + (Date.now() - start) + "ms");

var subprograms: Die[] = [];

function fill_subprogram() {
    for (const CU of CUs) {
        for (var die of CU.dies) {
            if (die.has_children) {
                for (var child of die.children) {
                    if (child.tag == "DW_TAG_subprogram") {
                        var low_pc = child.attributes["DW_AT_low_pc"];
                        var high_pc = child.attributes["DW_AT_high_pc"];
                        //console.log(low_pc,high_pc)
                        if (low_pc && low_pc.value > 0 && high_pc.value > 0) {
                            //console.log((low_pc.value<address));
                            subprograms.push(child);
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

function check_lineprog(lineprog: LineProgram|null, address: number) {
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
            console.log(directory + "/" + filename.name + ":" + line+prevstate.discriminator, prevstate.column);
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
console.log("check_address: " + (Date.now() - function_name_start) + "ms");

var line_start = Date.now();
for (const CU of CUs) {
    var lineprog = dwarfinfo.line_program_for_CU(CU);
    if (check_lineprog(lineprog, address)) {
        break;
    }
}
console.log("check_lineprog: " + (Date.now() - line_start) + "ms");
