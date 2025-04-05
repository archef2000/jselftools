export const ENUM_ST_INFO_BIND: {[key: number]: string} = {
    0x00: "STB_LOCAL",
    0x01: "STB_GLOBAL",
    0x02: "STB_WEAK",
    0x03: "STB_NUM",
    0x0a: "STB_LOOS",
    0x0c: "STB_HIOS",
    0x0d: "STB_LOPROC",
    0x0f: "STB_HIPROC",
}

export const ENUM_ST_INFO_TYPE: {[key: number]: string} = {
    0x00: "STT_NOTYPE",
    0x01: "STT_OBJECT",
    0x02: "STT_FUNC",
    0x03: "STT_SECTION",
    0x04: "STT_FILE",
    0x05: "STT_COMMON",
    0x06: "STT_TLS",
    0x07: "STT_NUM",
    0x0a: "STT_LOOS",
    0x0c: "STT_HIOS",
    0x0d: "STT_LOPROC",
    0x0f: "STT_HIPROC",
}

export const ENUM_ST_VISIBILITY: {[key: number]: string} = {
    0x00: "STV_DEFAULT",
    0x01: "STV_INTERNAL",
    0x02: "STV_HIDDEN",
    0x03: "STV_PROTECTED",
    0x04: "STV_EXPORTED",
    0x05: "STV_SINGLETON",
    0x06: "STV_ELIMINATE",
}

export const ENUM_ST_SHNDX: {[key: number]: string} = {
    0x00: "SHN_UNDEF",
    0xfff1: "SHN_ABS",
    0xfff2: "SHN_COMMON",
}