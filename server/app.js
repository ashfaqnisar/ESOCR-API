import express from 'express';
import path from 'path';
import morgan from 'morgan';
import cors from 'cors';
import * as Sentry from '@sentry/node';
import vision from '@google-cloud/vision'
import {Storage} from '@google-cloud/storage';

const app = express();


Sentry.init({dsn: 'https://f2c1250fc2344eaa8c11e9a3e2503fb9@o361783.ingest.sentry.io/5239445'});
// app.set('views', path.join(__dirname, 'routes'));
// app.set('view engine', 'pug');
app.use(Sentry.Handlers.requestHandler());
app.use(cors());
app.use(morgan("dev"));
app.use(express.json());
app.use(express.urlencoded({extended: false}));
app.use(express.static(path.join(__dirname, "public")));

const client = new vision.ImageAnnotatorClient()
const storage = new Storage();


const bucketName = "bucket-ezerka-ocr"

const bucketFileName = "sample.pdf"

const outputPrefix = 'results'

const gcsSourceUri = `gs://${bucketName}/${bucketFileName}`;
const gcsDestinationUri = `gs://${bucketName}/${outputPrefix}/`;

const inputConfig = {
    // Supported mime_types are: 'application/pdf' and 'image/tiff'
    mimeType: 'application/pdf',
    gcsSource: {
        uri: gcsSourceUri,
    },
};
const outputConfig = {
    gcsDestination: {
        uri: gcsDestinationUri,
    },
};
const features = [{type: 'DOCUMENT_TEXT_DETECTION'}];
const request = {
    requests: [
        {
            inputConfig: inputConfig,
            features: features,
            outputConfig: outputConfig,
        },
    ],
};


app.get('/', async (req, res) => {
    try {
        const [operation] = await client.asyncBatchAnnotateFiles(request);
        const [filesResponse] = await operation.promise();
        const destinationUri =
            filesResponse.responses[0].outputConfig.gcsDestination.uri;
        console.log('Json saved to: ' + destinationUri);

        res.status(200).send(destinationUri)
    } catch (e) {
        const err = {
            code: e.code || 500,
            message: e.message || e.status
        }
        res.status(e.code || 500).send(err)
    }

});
app.get("/upload", async (req, res) => {
    try {
        const fileName = './sampleUpload.pdf'
        await storage.bucket(bucketName).upload(fileName, {
            // Support for HTTP requests made with `Accept-Encoding: gzip`
            gzip: true,
            // By setting the option `destination`, you can change the name of the
            // object you are uploading to a bucket.
            metadata: {
                // Enable long-lived HTTP caching headers
                // Use only if the contents of the file will never change
                // (If the contents will change, use cacheControl: 'no-cache')
                cacheControl: 'public, max-age=31536000',
            },
        });
        res.status(200).send(`${fileName} uploaded to ${bucketName}`)
    } catch (e) {
        res.status(500).send(e)
    }
})

app.get('/debug-sentry', function mainHandler(req, res) {
    throw new Error('This is an test error!');
});

app.use(Sentry.Handlers.errorHandler());

app.use(function onError(err, req, res, next) {
    res.statusCode = 500;
    res.end(res.sentry + "\n" + err.message);
});

const listener = app.listen(process.env.PORT || 8080 || 8500, function () {
    console.log("Listening on port " + listener.address().port);
});

export default app;
