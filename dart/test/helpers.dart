import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:pawnshake/pawnshake.dart';

dynamic load(String f) => jsonDecode(File('../vectors/$f').readAsStringSync());

Uint8List hex(String s) => fromHex(s);
Uint8List b(List<int> a) => Uint8List.fromList(a);

/// The error code a call throws, "no error" when it returns.
String code(Object? Function() fn) {
  try {
    fn();
  } on PawnshakeError catch (e) {
    return e.code;
  }
  return 'no error';
}

Uint8List flip(List<int> x, int i) => Uint8List.fromList(x)..[i] ^= 1;
