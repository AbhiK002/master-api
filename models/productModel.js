import { Schema, model } from "mongoose";

const productSchema = new Schema({
    title: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    price: {
        type: Number,
        required: true
    },
    category: {
        type: String,
        required: true
    },
    outOfStock: {
        type: Boolean,
        required: true
    },
    photo: {
        type: String,
        required: true
    }
})

const Product = model("Product", productSchema);
export default Product;