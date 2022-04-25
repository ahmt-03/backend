const jwt = require('jsonwebtoken');
const User = require('../models/userModel');
// send 401 or 400 if token is not provided or invalid
const protectRoute = (req, res, next) => {
	const authHeader = req.headers['authorization'];
	const token = authHeader && authHeader.split(' ')[1];
	if (!token) {
		return res.status(401).json({ message: 'Unauthorized' });
	}
	try {
		const { id } = jwt.verify(token, process.env.SECRET_TOKEN);
		User.findById(id).then((user) => {
			if (!user) {
				return res.status(404).json({ message: 'User not found' });
			}
			req.user = user;
			next();
		});
	} catch (err) {
		console.log(err, 'HELO');
		res.status(400).json({ message: 'Invalid token' });
	}
};

module.exports = protectRoute;
