import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';
import dts from 'rollup-plugin-dts';

const external = [
  '@mediapipe/tasks-vision',
  '@tensorflow/tfjs',
  'ml-matrix'
];

// ESM build
const esmConfig = {
  input: 'src/index.ts',
  output: {
    file: 'dist/index.esm.js',
    format: 'esm',
    sourcemap: true,
    exports: 'named'
  },
  external,
  plugins: [
    resolve({
      browser: true,
      preferBuiltins: false
    }),
    commonjs(),
    typescript({
      tsconfig: './tsconfig.esm.json',
      declaration: false
    })
  ]
};

// ESM minified build
const esmMinConfig = {
  input: 'src/index.ts',
  output: {
    file: 'dist/index.esm.min.js',
    format: 'esm',
    sourcemap: true,
    exports: 'named'
  },
  external,
  plugins: [
    resolve({
      browser: true,
      preferBuiltins: false
    }),
    commonjs(),
    typescript({
      tsconfig: './tsconfig.esm.json',
      declaration: false
    }),
    terser()
  ]
};

// CommonJS build
const cjsConfig = {
  input: 'src/index.ts',
  output: {
    file: 'dist/index.cjs',
    format: 'cjs',
    sourcemap: true,
    exports: 'named'
  },
  external,
  plugins: [
    resolve({
      browser: true,
      preferBuiltins: false
    }),
    commonjs(),
    typescript({
      tsconfig: './tsconfig.cjs.json',
      declaration: false
    })
  ]
};

// Type definitions bundle
const dtsConfig = {
  input: 'dist/types/index.d.ts',
  output: {
    file: 'dist/index.d.ts',
    format: 'esm'
  },
  plugins: [dts()]
};

export default [esmConfig, esmMinConfig, cjsConfig, dtsConfig];
