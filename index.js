const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const connectDB = require('./config/db');
const { notFound, errorHandler } = require('./middlewares/errorMiddlware');
const authRouter = require('./routes/auth');
const paperswithcodeRouter = require('./routes/paperswithcode');
const datasetsearchRouter = require('./routes/datasetsearch');
const zenodoRouter = require('./routes/zenodo');
const kaggleRouter = require('./routes/kaggle');
const microsoftresearchRouter = require('./routes/microsoftresearch');
const timeRouter = require('./routes/time');
const protectRoute = require('./middlewares/protectRouteMiddleware');

const corsOptions ={
    origin:'*', 
    credentials:true,            //access-control-allow-credentials:true
    optionSuccessStatus:200,
 }
const app = express();
dotenv.config();
connectDB();
app.use(express.json());
app.use(cookieParser());
app.use(cors(corsOptions));
app.use('/api/auth', authRouter);
app.use('/api/paperswithcode', protectRoute, paperswithcodeRouter);
app.use('/api/zenodo', protectRoute, zenodoRouter);
app.use('/api/datasetsearch', protectRoute, datasetsearchRouter);
app.use('/api/kaggle', protectRoute, kaggleRouter);
app.use('/api/microsoftresearch', protectRoute, microsoftresearchRouter);
app.use('/api/time', protectRoute, timeRouter);
app.use('/healthcheck', (req, res) => res.send('Hello'));

app.use(notFound);
app.use(errorHandler);

app.listen(process.env.PORT || 5000, () => console.log('Server Runnig'));
