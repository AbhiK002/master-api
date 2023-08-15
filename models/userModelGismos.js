import { Schema, model } from "mongoose";

const userSchema = new Schema({
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

const UserGismos = model("User", userSchema)
export default UserGismos