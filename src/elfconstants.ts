/*
From https://github.com/indutny/elfy/blob/master/lib/elfy/constants.js
*/

let constants: { [key: string]: any } = {};

constants.class = {
    0: 'none',
    1: '32',
    2: '64',
    3: 'num'
}

constants.endian = {
    0: 'none',
    1: 'lsb',
    2: 'msb',
    3: 'num'
};

constants.version = {
    0: 'none',
    1: 'current',
    2: 'num'
};

constants.osabi = {
    0: 'sysv',
    1: 'hpux',
    2: 'netbsd',
    3: 'linux',
    4: 'unknown4',
    5: 'unknown5',
    6: 'solaris',
    7: 'aix',
    8: 'irix',
    9: 'freebsd',
    10: 'tru64',
    11: 'modesto',
    12: 'openbsd',
    13: 'openvms',
    14: 'nsk',
    15: 'aros',
    97: 'arm',
    255: 'standalone'
};

constants.abiversion = {
    0: 'none',
    1: 'current',
    2: 'num'
};

constants.machine = {
    0: 'none',
    1: 'm32',
    2: 'sparc',
    3: '386',
    4: '68k',
    5: '88k',
    6: '486',
    7: '860',
    8: 'mips',
    9: 's370',
    10: 'mips_rs3_le',
    11: 'rs6000',
    12: 'unknown12',
    13: 'unknown13',
    14: 'unknown14',
    15: 'pa_risc',
    16: 'ncube',
    17: 'vpp500',
    18: 'sparc32plus',
    19: '960',
    20: 'ppc',
    21: 'ppc64',
    22: 's390',
    23: 'unknown23',
    24: 'unknown24',
    25: 'unknown25',
    26: 'unknown26',
    27: 'unknown27',
    28: 'unknown28',
    29: 'unknown29',
    30: 'unknown30',
    31: 'unknown31',
    32: 'unknown32',
    33: 'unknown33',
    34: 'unknown34',
    35: 'unknown35',
    36: 'v800',
    37: 'fr20',
    38: 'rh32',
    39: 'rce',
    40: 'arm',
    41: 'alpha',
    42: 'sh',
    43: 'sparcv9',
    44: 'tricore',
    45: 'arc',
    46: 'h8_300',
    47: 'h8_300h',
    48: 'h8s',
    49: 'h8_500',
    50: 'ia_64',
    51: 'mips_x',
    52: 'coldfire',
    53: '68hc12',
    54: 'mma',
    55: 'pcp',
    56: 'ncpu',
    57: 'ndr1',
    58: 'starcore',
    59: 'me16',
    60: 'st100',
    61: 'tinyj',
    62: 'amd64',
    63: 'pdsp',
    64: 'unknown64',
    65: 'unknown65',
    66: 'fx66',
    67: 'st9plus',
    68: 'st7',
    69: '68hc16',
    70: '68hc11',
    71: '68hc08',
    72: '68hc05',
    73: 'svx',
    74: 'st19',
    75: 'vax',
    76: 'cris',
    77: 'javelin',
    78: 'firepath',
    79: 'zsp',
    80: 'mmix',
    81: 'huany',
    82: 'prism',
    83: 'avr',
    84: 'fr30',
    85: 'd10v',
    86: 'd30v',
    87: 'v850',
    88: 'm32r',
    89: 'mn10300',
    90: 'mn10200',
    91: 'pj',
    92: 'openrisc',
    93: 'arc_a5',
    94: 'xtensa',
    95: 'num',
    183: 'AArch64'
};

constants.type = {
    0: 'none',
    1: 'rel',
    2: 'exec',
    3: 'dyn',
    4: 'core',
    5: 'num'
};

constants.entryType = {
    0: 'null',
    1: 'load',
    2: 'dynamic',
    3: 'interp',
    4: 'note',
    5: 'shlib',
    6: 'phdr',
    7: 'tls',

    0x6464e550: 'sunw_unwind',
    0x6474e550: 'sunw_eh_frame',
    0x6474e551: 'gnu_stack',
    0x6474e552: 'gnu_relro',

    0x6ffffffa: 'losunw', // "sunwbss"
    0x6ffffffb: 'sunwstack',
    0x6ffffffc: 'sunwdtrace',
    0x6ffffffd: 'sunwcap'
};

constants.entryFlags = {
    4: 'r',
    2: 'w',
    1: 'x',
    0x00100000: 'sunw_failure',
    0x00200000: 'sunw_killed',
    0x00400000: 'sunw_siginfo'
};

constants.sectType = {
    0: 'null', // "undef"
    1: 'progbits',
    2: 'symtab',
    3: 'strtab',
    4: 'rela',
    5: 'hash',
    6: 'dynamic',
    7: 'note',
    8: 'nobits',
    9: 'rel',
    10: 'shlib',
    11: 'dynsym',
    12: 'unknown12',
    13: 'unknown13',
    14: 'init_array',
    15: 'fini_array',
    16: 'preinit_array',
    17: 'group',
    18: 'symtab_shndx',
    19: 'num',
    0x60000000: 'loos',
    0x6fffffef: 'sunw_capchain',
    0x6ffffff0: 'sunw_capinfo',
    0x6ffffff1: 'sunw_symsort',
    0x6ffffff2: 'sunw_tlssort',
    0x6ffffff3: 'sunw_ldynsym',
    0x6ffffff4: 'sunw_dof',
    0x6ffffff9: 'sunw_debug',
    0x6ffffffa: 'sunw_move',
    0x6ffffffb: 'sunw_comdat',
    0x6ffffffc: 'sunw_syminfo',
    0x6ffffffd: 'sunw_verdef',
    0x6ffffffe: 'sunw_verneed',
    0x6fffffff: 'sunw_versym', // "hisunw", "hios"
    0x6ffffff5: 'gnu_attributes',
    0x6ffffff6: 'gnu_hash',
    0x6ffffff7: 'gnu_liblist',
    0x6ffffff8: 'checksum'
};

constants.sectFlags = {
    0x01: 'write',
    0x02: 'alloc',
    0x04: 'execinstr',
    0x10: 'merge',
    0x20: 'strings',
    0x40: 'info_link',
    0x80: 'link_order',
    0x100: 'os_nonconforming',
    0x200: 'group',
    0x400: 'tls'
};

export default constants;