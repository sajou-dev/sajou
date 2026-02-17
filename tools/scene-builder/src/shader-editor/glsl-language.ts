/**
 * GLSL syntax highlighting for CodeMirror 6.
 *
 * Uses @codemirror/lang-cpp as a C-like base and adds GLSL-specific
 * keyword highlighting via a custom LanguageSupport extension.
 */

import { cpp } from "@codemirror/lang-cpp";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import type { Extension } from "@codemirror/state";

/** GLSL-specific keywords for reference (used by autocomplete in future). */
export const GLSL_KEYWORDS = [
  "attribute", "const", "uniform", "varying",
  "break", "continue", "do", "for", "while",
  "if", "else", "switch", "case", "default",
  "in", "out", "inout",
  "discard", "return",
  "struct", "precision",
  "highp", "mediump", "lowp",
  "flat", "smooth", "centroid",
  "layout", "invariant",
  "#version", "#extension", "#define", "#undef",
  "#if", "#ifdef", "#ifndef", "#else", "#elif", "#endif",
];

/** GLSL types. */
export const GLSL_TYPES = [
  "void", "bool", "int", "uint", "float", "double",
  "vec2", "vec3", "vec4",
  "ivec2", "ivec3", "ivec4",
  "uvec2", "uvec3", "uvec4",
  "bvec2", "bvec3", "bvec4",
  "mat2", "mat3", "mat4",
  "mat2x2", "mat2x3", "mat2x4",
  "mat3x2", "mat3x3", "mat3x4",
  "mat4x2", "mat4x3", "mat4x4",
  "sampler2D", "sampler3D", "samplerCube",
  "sampler2DShadow", "samplerCubeShadow",
  "isampler2D", "isampler3D", "isamplerCube",
  "usampler2D", "usampler3D", "usamplerCube",
];

/** GLSL built-in functions. */
export const GLSL_BUILTINS = [
  "radians", "degrees", "sin", "cos", "tan", "asin", "acos", "atan",
  "sinh", "cosh", "tanh", "asinh", "acosh", "atanh",
  "pow", "exp", "log", "exp2", "log2", "sqrt", "inversesqrt",
  "abs", "sign", "floor", "ceil", "trunc", "round", "roundEven",
  "fract", "mod", "modf", "min", "max", "clamp",
  "mix", "step", "smoothstep",
  "length", "distance", "dot", "cross", "normalize", "faceforward",
  "reflect", "refract",
  "matrixCompMult", "outerProduct", "transpose", "determinant", "inverse",
  "lessThan", "lessThanEqual", "greaterThan", "greaterThanEqual",
  "equal", "notEqual", "any", "all", "not",
  "texture", "textureSize", "textureLod", "texelFetch",
  "dFdx", "dFdy", "fwidth",
  "intBitsToFloat", "uintBitsToFloat", "floatBitsToInt", "floatBitsToUint",
  "packSnorm2x16", "unpackSnorm2x16", "packUnorm2x16", "unpackUnorm2x16",
  "packHalf2x16", "unpackHalf2x16",
];

/** Auto-injected uniform names for highlighting. */
export const GLSL_AUTO_UNIFORMS = [
  "iTime", "iTimeDelta", "iResolution", "iMouse", "iFrame", "iChannel0",
];

/** Sajou's GLSL theme highlighting (builds on One Dark). */
const glslHighlight = HighlightStyle.define([
  { tag: tags.keyword, color: "#c678dd" },
  { tag: tags.typeName, color: "#e5c07b" },
  { tag: tags.number, color: "#d19a66" },
  { tag: tags.string, color: "#98c379" },
  { tag: tags.comment, color: "#5c6370", fontStyle: "italic" },
  { tag: tags.function(tags.variableName), color: "#61afef" },
  { tag: tags.definition(tags.variableName), color: "#e06c75" },
  { tag: tags.operator, color: "#56b6c2" },
  { tag: tags.macroName, color: "#e5c07b" },
]);

/** Full GLSL language extension for CodeMirror. */
export function glslLanguage(): Extension {
  return [
    cpp(),
    syntaxHighlighting(glslHighlight),
  ];
}
