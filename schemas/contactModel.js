import { Schema } from "mongoose";

const contactSchema = new Schema({
    user_id: {
        type: String,
        required: true
    },
    name: {
        type: String,
        required: true
    },
    ph_num: {
        type: String
    }
})

export default contactSchema