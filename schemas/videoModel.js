import { Schema } from "mongoose";

const videoSchema = new Schema({
    course: {
        type: String,
        required: true
    },
    title: {
        type: String,
        required: true
    },
    description: {
        type: String
    },
    url: {
        type: String,
        required: true
    },
    week: {
        type: Number,
        required: true
    },
    day: {
        type: Number,
        required: true
    }
})

export default videoSchema