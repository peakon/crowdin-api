module.exports = {
	src: [
		'**/*.js',
		'!node_modules/**/*.*',
		'!coverage/**/*.*'
	],
	options: {
		config: '.jscsrc',
		verbose: true
	}
};