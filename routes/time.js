const express = require('express');

const router = express.Router();
const Time = require('../models/timeModel');

router.post('/urlClicked', (req, res) => {
	const { time, url } = req.body;
	const timeData = new Time({
		name: req.user.name,
		email: req.user.email,
		time,
		url
	});
	timeData
		.save()
		.then((timeData) => {
			res.json(timeData);
		})
		.catch((err) => res.json(err));
});

module.exports = router;
