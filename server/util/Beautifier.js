import dot from 'dot-object'

export const processResponse = (response) => {
    let data = {};
    data["uploadedFile"] = response.result[0].input
    data["prediction"] = {}
    response.result[0].prediction.map(prediction => {
        data["prediction"] = {[prediction.label]: prediction.ocr_text, ...data["prediction"]}
    })
    data["prediction"] = dot.object(data["prediction"])
    data["gcsFile"] = response.result[0].filepath.split("/")[3].split(".")[0]
    return data
}