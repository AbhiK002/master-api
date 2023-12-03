import { Schema } from "mongoose";

const courseSchema = new Schema({
    title: {
        type: String,
        required: true
    },
    description: {
        type: String
    },
    summary: {
        type: String,
        required: true
    },
    thumbnail: {
        type: String
    },
    instructor: {
        type: String,
        required: true
    },
    cost: {
        type: Number
    },
    coming_soon: {
        type: Boolean
    }
})

export default courseSchema;