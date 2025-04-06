import DWARFInfo from './dwarfinfo';
import constants from "./elfconstants";
import { readCString } from "./helpers";
import { ELFStructs } from './structs';
import { ENUM_ST_INFO_BIND, ENUM_ST_INFO_TYPE, ENUM_ST_SHNDX, ENUM_ST_VISIBILITY } from './enums';

export default class ELFFile {
    sections: { [key: string]: DataView } = {};
    little_endian: boolean = false;
    header: ElfHeader;
    body: ElfBody;

    constructor(fileData: ArrayBufferLike) {
        this.header = new ElfHeader(fileData);
        this.body = new ElfBody(this.header);
        this.resolveBody();
        this.parse_sections();
    }

    resolveBody() {
        var strtab = this.body.sections[this.header.shstrndx];
        for (const section of this.body.sections) {
            section.name = this.resolveStr(strtab, section.name_offset);
        }
    }

    resolveStr(strtab: ElfSection, offset: number): string {
        if (strtab.type !== "strtab") {
            throw new Error("Invalid strtab");
        }
        return readCString(strtab.data, offset).value;
    }

    get_symtab(): ElfSymbolTableSection | undefined {
        for (const section of this.body.sections) {
            if (section.type == "symtab") {
                return new ElfSymbolTableSection(section, this);
            }
        }
        return undefined;
    }

    parse_sections() {
        for (const section of this.body.sections) {
            this.sections[section.name.replace(".", "") + "_sec"] = section.data;
        }
        this.little_endian = this.header.isLE;
    }

    has_dwarf_info(strict: boolean = false): boolean {
        if (this.sections["debug_info_sec"] || this.sections["zdebug_info_sec"]) {
            return true;
        }
        if (!strict && this.sections["eh_frame_sec"]) {
            return true;
        }
        return false;
    }

    get_dwarf_info() {
        return new DWARFInfo(this.sections, this.little_endian);
    }
}


export class ElfHeader {
    data: DataView;
    isLE: boolean;
    read16: (buffer: DataView, offset: number) => number;
    read32: (buffer: DataView, offset: number) => number;
    read64: (buffer: DataView, offset: number) => BigInt;

    class: string;
    endian: string;
    osabi: string;
    abiversion: string;
    type: string;
    machine: string;
    version: number;
    entry: number | BigInt;
    phoff: number | BigInt;
    shoff: number | BigInt;
    flags: number;
    ehsize: number;
    phentsize: number;
    phnum: number;
    shentsize: number;
    shnum: number;
    shstrndx: number;

    constructor(data: ArrayBufferLike) {
        this.data = new DataView(data);
        const magic2 = String.fromCharCode(...new Uint8Array(data, 0, 4));
        if (magic2 !== "\x7fELF") {
            throw new Error("Invalid ELF header");
        }
        this.class = constants.class[this.data.getUint8(4)];
        this.endian = constants.endian[this.data.getUint8(5)];
        this.isLE = this.endian === 'lsb';
        this.read16 = (buffer: DataView, offset: number) => buffer.getUint16(offset, this.isLE);
        this.read32 = (buffer: DataView, offset: number) => buffer.getUint32(offset, this.isLE);
        this.read64 = (buffer: DataView, offset: number) => buffer.getBigUint64(offset, this.isLE);

        this.osabi = constants.osabi[this.data.getUint8(6)];
        this.abiversion = constants.abiversion[this.data.getUint8(7)];
        if (this.class !== "32" && this.class !== "64") {
            throw new Error("Invalid class: " + this.class + this.data.getUint8(4));
        }
        if (this.endian !== 'lsb' && this.endian !== 'msb') {
            throw new Error('Invalid endian: ' + this.endian);
        }

        this.type = constants.type[this.read16(this.data, 16)];
        this.machine = constants.machine[this.read16(this.data, 18)];
        this.version = this.read32(this.data, 20);
        var offset: number = 24;
        var { value: entry, offset } = this.readOffset(this.data, offset);
        this.entry = entry;
        var { value: phoff, offset } = this.readOffset(this.data, offset);
        this.phoff = phoff;
        var { value: shoff, offset } = this.readOffset(this.data, offset);
        this.shoff = shoff;
        this.flags = this.read32(this.data, offset);
        offset += 4;
        this.ehsize = this.read16(this.data, offset);
        offset += 2;
        this.phentsize = this.read16(this.data, offset);
        offset += 2;
        this.phnum = this.read16(this.data, offset);
        offset += 2;
        this.shentsize = this.read16(this.data, offset);
        offset += 2;
        this.shnum = this.read16(this.data, offset);
        offset += 2;
        this.shstrndx = this.read16(this.data, offset);
        offset += 2;
    }

    readWord(offset: number) {
        if (this.class === "32") {
            return {
                value: this.data.buffer.slice(offset, offset + 4).toString(),
                size: 4
            };
        } else {
            return {
                value: this.data.buffer.slice(offset, offset + 8).toString(),
                size: 8
            };
        }
    }

    readOffset(data: DataView, offset: number) {
        if (this.class === "32") {
            return {
                value: this.read32(data, offset),
                offset: offset + 4
            }
        } else {
            return {
                value: this.read64(data, offset),
                offset: offset + 8
            }
        }
    }
}

export class ElfSymbolTableSection {
    section: ElfSection;
    structs: ELFStructs;
    elfFile: ELFFile;

    constructor(section: ElfSection, elfFile: ELFFile) {
        this.section = section;
        this.structs = new ELFStructs(elfFile.header);
        this.elfFile = elfFile;
    }

    num_symbols() {
        return Number(this.section.size) / Number(this.section.entsize);
    }

    get_symbol(n: number) {
        var offset = Number(this.section.off) + n * Number(this.section.entsize);
        offset -= Number(this.section.off);
        var strtab = this.elfFile.body.sections[this.section.link];
        const strResolver = (offset: number) => {
            return this.elfFile.resolveStr(strtab, offset)
        };
        return new ElfSymbol(this.section.data, offset, this.structs, strResolver);
    }

    *iter_symbols() {
        for (let i = 0; i < this.num_symbols(); i++) {
            yield this.get_symbol(i);
        }
    }
}

export type ST_INFO = { bind: string | number; type: string | number };
export type ST_OTHER = { local: number; visibility: string | number };

export class ElfSymbol {
    offset: number;

    name: string;
    info: ST_INFO;
    other: ST_OTHER;
    shndx: number | string;
    size: number;
    value: number | BigInt;

    constructor(data: DataView, offset: number, structs: ELFStructs, strResolver: (offset: number) => string) {
        this.offset = offset;
        if (structs.is32) {
            var [name_offset, offset] = structs.read_word(data, offset);
            this.name = strResolver(name_offset);
            var [value, offset] = structs.read_addr(data, offset);
            this.value = value;
            var [size, offset] = structs.read_word(data, offset);
            this.size = size;
            this.info = this.parse_st_info(data, offset++);
            this.other = this.parse_st_other(data, offset++);
            var [st_shndx_number, offset] = structs.read_half(data, offset);
            this.shndx = ENUM_ST_SHNDX[st_shndx_number] || st_shndx_number;
        } else {
            var [name_offset, offset] = structs.read_word(data, offset);
            this.name = strResolver(name_offset);
            this.info = this.parse_st_info(data, offset++);
            this.other = this.parse_st_other(data, offset++);
            var [st_shndx_number, offset] = structs.read_half(data, offset);
            this.shndx = ENUM_ST_SHNDX[st_shndx_number] || st_shndx_number;
            var [value, offset] = structs.read_addr(data, offset);
            this.value = value;
            var [size, offset] = structs.read_word(data, offset);
            this.size = size;
        }

    }
    private parse_st_info(data: DataView, offset: number): ST_INFO {
        const byte = data.getUint8(offset);
        const bind = (byte >> 4) & 0x0F;
        const type = byte & 0x0F;

        return {
            bind: ENUM_ST_INFO_BIND[bind] || bind,
            type: ENUM_ST_INFO_TYPE[type] || type,
        };
    }
    private parse_st_other(data: DataView, offset: number): ST_OTHER {
        const byte = data.getUint8(offset);
        const localBits = (byte >> 5) & 0b111;
        const visibilityBits = byte & 0b111;

        return {
            local: localBits,
            visibility: ENUM_ST_VISIBILITY[visibilityBits] || visibilityBits,
        };
    }
}


export class ElfBody {
    data: DataView;
    programs: ElfProgram[];
    sections: ElfSection[];
    header: ElfHeader;

    constructor(header: ElfHeader) {
        this.data = header.data;
        this.header = header;
        this.programs = this.parsePrograms();
        this.sections = this.parseSections();
    }

    parsePrograms(): ElfProgram[] {
        if (this.header.phoff === 0 || this.header.phnum === 0) {
            return [];
        }
        var programChunks = this.sliceChunks(Number(this.header.phoff), this.header.phnum, this.header.phentsize);
        var programs: ElfProgram[] = [];
        for (const programChunk of programChunks) {
            programs.push(new ElfProgram(programChunk, this.header));
        }
        return programs;
    }

    parseSections(): ElfSection[] {
        if (this.header.shoff === 0 || this.header.shnum === 0) {
            return [];
        }
        var sectionChunks = this.sliceChunks(Number(this.header.shoff), this.header.shnum, this.header.shentsize);
        var programs: ElfSection[] = [];
        for (const sectionChunk of sectionChunks) {
            programs.push(new ElfSection(sectionChunk, this.header));
        }
        return programs;
    }

    sliceChunks(offset: number, count: number, size: number): DataView[] {
        var start = offset;
        var end = start + count * size;
        if (end > this.data.byteLength) {
            throw new Error("Failed to slice chunks");
        }
        var chunks = [];
        for (var off = start; off < end; off += size) {
            chunks.push(new DataView(this.data.buffer, off, size));
            //chunks.push(new DataView(this.data.buffer.slice(off, off + size)));
        }
        return chunks;
    }
}

function mapFlags(value: number | BigInt, map: { [key: number]: string }) {
    value = Number(value);
    var res: { [key: number | string]: boolean } = {};

    for (var bit = 1; (value < 0 || bit <= value) && bit !== 0; bit <<= 1)
        if (value & bit)
            res[map[bit] || bit] = true;

    return res;
}

export class ElfProgram {
    data: DataView;
    type: string;
    offset: number | BigInt;
    flags: { [key: number | string]: boolean };
    vaddr: number | BigInt;
    paddr: number | BigInt;
    filesz: number | BigInt;
    memsz: number | BigInt;
    align: number | BigInt;

    constructor(data: DataView, header: ElfHeader) {
        this.type = constants.entryType[header.read32(data, 0)];
        var bufferOffset = 4;
        var flags: number | BigInt = 0;
        if (header.class === "64") {
            flags = header.read32(data, bufferOffset);
            bufferOffset += 4;
        }
        var { value: offset, offset: bufferOffset } = header.readOffset(data, bufferOffset);
        this.offset = offset;
        var { value: vaddr, offset: bufferOffset } = header.readOffset(data, bufferOffset);
        this.vaddr = vaddr;
        var { value: paddr, offset: bufferOffset } = header.readOffset(data, bufferOffset);
        this.paddr = paddr;
        var { value: filesz, offset: bufferOffset } = header.readOffset(data, bufferOffset);
        this.filesz = filesz;
        var { value: memsz, offset: bufferOffset } = header.readOffset(data, bufferOffset);
        this.memsz = memsz;
        if (header.class === "32") {
            flags = header.read32(data, bufferOffset);
            bufferOffset += 4;
        }
        var { value: align, offset: bufferOffset } = header.readOffset(data, bufferOffset);
        this.align = align;

        this.flags = mapFlags(flags, constants.entryFlags);
        this.data = new DataView(header.data.buffer, Number(this.offset), Number(this.filesz));
        //this.data = new DataView(header.data.buffer.slice(Number(this.offset), Number(this.offset) + Number(this.filesz)));
    }
}

export class ElfSection {
    name: string;
    name_offset: number;
    type: number | string;
    flags: { [key: number | string]: boolean };
    addr: number | BigInt;
    off: number | BigInt;
    size: number | BigInt;
    link: number;
    info: number;
    addralign: number | BigInt;
    entsize: number | BigInt;
    data: DataView;

    constructor(data: DataView, header: ElfHeader) {
        this.name_offset = header.read32(data, 0);
        this.name = "";
        var type = header.read32(data, 4);
        this.type = constants.sectType[type] || type;
        var bufferOffset = 8;
        var { value: flags, offset: bufferOffset } = header.readOffset(data, bufferOffset);
        this.flags = mapFlags(flags, constants.sectFlags);
        var { value: addr, offset: bufferOffset } = header.readOffset(data, bufferOffset);
        this.addr = addr;
        var { value: off, offset: bufferOffset } = header.readOffset(data, bufferOffset);
        this.off = off;
        var { value: size, offset: bufferOffset } = header.readOffset(data, bufferOffset);
        this.size = size;
        this.link = header.read32(data, bufferOffset);
        bufferOffset += 4;
        this.info = header.read32(data, bufferOffset);
        bufferOffset += 4;
        var { value: addralign, offset: bufferOffset } = header.readOffset(data, bufferOffset);
        this.addralign = addralign;
        var { value: entsize, offset: bufferOffset } = header.readOffset(data, bufferOffset);
        this.entsize = entsize;
        this.data = new DataView(header.data.buffer, Number(this.off), Number(this.size));
        //this.data = new DataView(header.data.buffer.slice(Number(this.off), Number(this.off) + Number(this.size)));
    }
}
