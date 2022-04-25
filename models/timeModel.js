const mongoose = require('mongoose');
const { Schema } = mongoose;

const timeSchema = new Schema(
	{
		name: {
			type: String,
			required: true
		},
		email: {
			type: String,
			required: true
		},
		time: {
			type: String,
			required: true
		},
		url: {
			type: String,
			required: true
		}
	},
	{
		timestamps: true
	}
);

const time = mongoose.model('Time', timeSchema);

module.exports = time;
