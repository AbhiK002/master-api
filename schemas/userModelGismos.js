import { Schema } from "mongoose";

const userSchemaGismos = new Schema({
    name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: true
    },
    cart: {
        type: Array
    },
    orders: {
        type: Array
    }
}, {timestamps: true})

export default userSchemaGismos