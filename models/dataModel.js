const mongoose = require('mongoose');
const { Schema } = mongoose;

const dataSchema = new Schema(
	{
		name: {
			type: String,
			required: true
		},
		email: {
			type: String,
			required: true
		},
		search: {
			// json
			type: Object,
			required: true
		},
		data: {
			type: Object,
			required: true
		},
		platform: {
			type: String,
			required: true
		}
	},
	{
		timestamps: true
	}
);

const data = mongoose.model('Data', dataSchema);

module.exports = data;
