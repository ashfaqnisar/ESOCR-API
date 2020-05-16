import express from 'express';
import path from 'path';
import morgan from 'morgan';
import cors from 'cors';
import firebase, {db} from './firebase'
import * as Sentry from '@sentry/node';
import vision from '@google-cloud/vision'
import {Storage} from '@google-cloud/storage';
import multer, {memoryStorage} from "multer";
import serviceOptions from './service'

const app = express();


Sentry.init({dsn: 'https://f2c1250fc2344eaa8c11e9a3e2503fb9@o361783.ingest.sentry.io/5239445'});

app.use(Sentry.Handlers.requestHandler());
app.use(cors());
app.use(morgan("dev"));
app.use(express.json());
app.use(express.urlencoded({extended: false}));
app.use(express.static(path.join(__dirname, "public")));


const client = new vision.ImageAnnotatorClient(serviceOptions)
const storage = new Storage(serviceOptions);

const increment = firebase.firestore.FieldValue.increment(1);

const bucketName = "bucket-ezerka-ocr"

const bucketFileName = "best.pdf"

const outputPrefix = 'results'

const gcsSourceUri = `gs://${bucketName}/${bucketFileName}`;
const gcsDestinationUri = `gs://${bucketName}/${outputPrefix}/`;


const inputConfig = {
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

const mul = multer({
    storage: memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024
    }
});
const bucket = storage.bucket(bucketName)


app.get('/', (req, res) => {
    res.status(200).send(`OCR API`)
});

app.post("/users", async (req, res) => {
    try {
        const {name, email, uid} = req.body;
        const userData = {
            name, email, uid
        };

        const statsRef = db.collection("--stats--").doc("customers");
        const batch = db.batch();

        const userRef = await db.collection("users").doc(uid);
        batch.set(userRef, userData,);
        batch.set(statsRef, {count: increment}, {merge: true});
        await batch.commit()

        const user = await userRef.get();
        res.status(200).send(user.data());

    } catch (err) {
        const error = {
            code: err.code || 500,
            message: err.message || err.status,
        }
        res.status(err.code || 500).json(error);
    }
})
app.get("/users/:uid", async (req, res) => {
    try {
        const {uid} = req.params;

        const userRef = db.collection("users").doc(uid.toString())
        let user = await userRef.get()
        if (!user.exists) {
            const emptyError = {
                code: 204,
                message: `No, user available with ${uid}`
            }
            res.status(400).json(emptyError)
        }
        res.status(200).send(user.data());

    } catch (err) {
        const error = {
            code: err.code || 500,
            message: err.message || err.status,
        }
        res.status(err.code || 500).json(error);
    }

});

app.post("/ocr", async (req, res) => {
    try {
        const {image} = req.body;
        const {uid} = req.query;

        if (!uid) {
            res.status(400).json({code: 400, message: "Please,provide the uid with the request"})
        }

        const statsRef = db.collection("--stats--").doc("ocr");

        const userRef = db.collection("users").doc(uid)
        const ocrRef = userRef.collection("ocr").doc()

        const batch = db.batch();

        batch.set(ocrRef, {image, ocrId: ocrRef.id, text: "Text from image"});
        batch.set(statsRef, {count: increment}, {merge: true});
        await batch.commit()

        const ocr = await ocrRef.get()
        res.status(200).send(ocr.data());

    } catch (err) {
        const error = {
            code: err.code || 500,
            message: err.message || err.status,
        }
        res.status(err.code || 500).json(error);
    }
})
app.get("/ocr/:ocrId", async (req, res) => {
    try {
        const {ocrId} = req.params;
        const {uid} = req.query;

        if (!(ocrId && uid)) {
            res.status(400).json({code: 400, message: "Please,provide the uid & ocrId"})
        }

        const ocrRef = db.collection("users").doc(uid).collection("ocr").doc(ocrId)
        let ocr = await ocrRef.get()
        if (!ocr.exists) {
            const emptyError = {
                code: 204,
                message: `No, ocr available with ${uid}`
            }
            res.status(400).json(emptyError)
        }
        res.status(200).send(ocr.data());

    } catch (err) {
        const error = {
            code: err.code || 500,
            message: err.message || err.status,
        }
        res.status(err.code || 500).json(error);
    }

});
app.get("/ocr", async (req, res) => {
    try {
        const {uid} = req.query;
        if (!uid) {
            res.status(400).json({code: 400, message: "Please,provide the uid with the request"})
        }
        let ocrArray;

        const ocrDocs = await db.collection("users").doc(uid).collection("ocr").get()

        ocrArray = ocrDocs.docs.map(ocrDoc => ocrDoc.data())

        res.status(200).send(ocrArray);

    } catch (err) {
        const error = {
            code: err.code || 500,
            message: err.message || err.status,
        }
        res.status(err.code || 500).json(error);
    }

});


app.get('/process', async (req, res) => {
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
app.post("/upload", mul.single("file"), async (req, res, next) => {
    try {
        if (!req.file) {
            res.status(400).json('Provide an pdf')
        }
        const gcsFileName = `${req.file.originalname}`
        const file = bucket.file(gcsFileName);

        const blobStream = file.createWriteStream({
            metadata: {
                contentType: req.file.mimetype
            }
        });

        blobStream.on("error", err => {
            next(err);
        });

        blobStream.on("finish", () => {
            // The public URL can be used to directly access the file via HTTP.
            const publicUrl = `https://storage.googleapis.com/${bucket.name}/${file.name}`;

            // Make the image public to the web (since we'll be displaying it in browser)
            file.makePublic().then(() => {
                res.status(200).send(`Success!\n Image uploaded to ${publicUrl}`);
            });
        });

        blobStream.end(req.file.buffer);

    } catch (e) {
        res.status(500).send({...e})
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
