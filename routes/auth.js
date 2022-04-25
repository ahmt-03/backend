const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const router = express.Router();
const User = require('../models/userModel');

router.post('/register', (req, res) => {
	const { name, email, password } = req.body;
	const hashedPassword = bcrypt.hashSync(password, 10);
	const user = new User({ name, email, password: hashedPassword });
	user
		.save()
		.then((user) => {
			const token = jwt.sign({ id: user._id }, process.env.SECRET_TOKEN, { expiresIn: '1d' });
			// res.cookie('token', token, { httpOnly: true });
			return res.json({
				email: user.email,
				name: user.name,
				token
			});
		})
		.catch((err) => res.json(err));
});

router.post('/login', (req, res) => {
	const { email, password } = req.body;
	User.findOne({ email }).then((user) => {
		if (!user) {
			return res.status(404).json({ message: 'User not found' });
		}
		if (!bcrypt.compareSync(password, user.password)) {
			return res.status(400).json({ message: 'Incorrect password' });
		}
		const token = jwt.sign({ id: user._id }, process.env.SECRET_TOKEN, { expiresIn: '1d' });
		// res.cookie('token', token, { httpOnly: true });
		res.json({
			email: user.email,
			name: user.name,
			token
		});
	});
});

router.post('/logout', (req, res) => {
	res.clearCookie('token');
	res.json({ message: 'Logged out' });
});

router.post('/me', (req, res) => {
	const authHeader = req.headers['authorization'];
	const token = authHeader && authHeader.split(' ')[1];
	if (!token) {
		return res.status(401).json({ message: 'Unauthorized' });
	}
	const { id } = jwt.verify(token, process.env.SECRET_TOKEN);
	User.findById(id).then((user) => {
		if (!user) {
			return res.status(404).json({ message: 'User not found' });
		}
		res.json({
			email: user.email,
			name: user.name
		});
	});
});

module.exports = router;
