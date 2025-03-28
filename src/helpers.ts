export function readCString(dataView: DataView, offset: number): { value: string, nextOffset: number } {
  let str = "";
  let byte;
  while ((byte = dataView.getUint8(offset)) !== 0) {
    str += String.fromCharCode(byte);
    offset++;
  }
  return { value: str, nextOffset: offset + 1 };
}

export function readString(dataView: DataView, offset: number, end: number): { value: string, nextOffset: number } 
{
  let str = "";
  let byte;
  while (offset < end) {
    byte = dataView.getUint8(offset);
    str += String.fromCharCode(byte);
    offset++;
  }
  return { value: str, nextOffset: offset };
}

// --- Helper Functions for LEB128 ---
export function readULEB128(dataView: DataView, offset: number): [number, number] {
  let result = 0;
  let shift = 0;
  let byte;
  do {
    byte = dataView.getUint8(offset++);
    result |= (byte & 0x7f) << shift;
    shift += 7;
  } while (byte & 0x80);
  return [result, offset];
}

export function readSLEB128(dataView: DataView, offset: number): [number, number] {
  let result = 0;
  let shift = 0;
  let byte;
  do {
    byte = dataView.getUint8(offset++);
    result |= (byte & 0x7f) << shift;
    shift += 7;
  } while (byte & 0x80);
  // sign-extend if necessary
  if ((byte & 0x40) !== 0) {
    result |= - (1 << shift);
  }
  return [result, offset];
}
