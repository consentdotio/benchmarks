import { defineConfig } from '@rslib/core';

export default defineConfig({
	source: {
		entry: {
			index: './src/index.ts',
		},
		exclude: ['figlet'],
	},
	lib: [
		{
			bundle: true,
			dts: true,
			format: 'esm',
		},
	],
	output: {
		target: 'node',
		cleanDistPath: true,
		filename: {
			js: '[name].mjs',
		},
	},
});
