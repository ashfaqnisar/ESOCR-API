import express from 'express';
import path from 'path';
import morgan from 'morgan';
import cors from 'cors';
import * as Sentry from '@sentry/node';

import users from './routes/users'
import ocr from './routes/ocr'

const app = express();


Sentry.init({
    environment: process.env.NODE_ENV,
    dsn: 'https://f2c1250fc2344eaa8c11e9a3e2503fb9@o361783.ingest.sentry.io/5239445'
});

app.use(Sentry.Handlers.requestHandler());
app.use(cors());
app.use(morgan("dev"));
app.use(express.json());
app.use(express.urlencoded({extended: false}));
app.use(express.static(path.join(__dirname, "public")));

app.get('/', (req, res) => {
    res.end(`ESOCR API`)
});

app.use('/', users)
app.use('/', ocr)

app.use(Sentry.Handlers.errorHandler());

app.use(function onError(err, req, res) {
    res.statusCode = 500;
    res.end(res.sentry + "\n" + err.message);
});

const listener = app.listen(process.env.PORT || 8080 || 8500, function () {
    console.log("Listening on port " + listener.address().port);
});

export default app;
