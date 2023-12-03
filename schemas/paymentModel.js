import { Schema } from "mongoose";

const paymentSchema = new Schema({
    user_id: {
        type: String,
        required: true
    },
    course_id: {
        type: String,
        required: true
    },
    success: {
        type: Boolean,
        required: true
    },
    payment_id: {
        type: String,
        required: true
    },
    amount: {
        type: Number,
        required: true
    }
}, {timestamps: true})

export default paymentSchema