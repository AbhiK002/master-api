import express, { json } from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import bcrypt from 'bcrypt';
import helmet from 'helmet';
import compression from 'compression';
import { rateLimit } from 'express-rate-limit';
import dotenv from 'dotenv';

import UserGismos from './models/userModelGismos.js';
import Product from './models/productModel.js';
import { verifyToken, generateToken } from './middleware/auth.js';

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;
const DB_URI_GISMOS = process.env.DB_URI_GISMOS;

app.use(cors());
app.use(json());
app.use(helmet());
app.use(compression());
const limiter = rateLimit({
	windowMs: 1 * 60 * 1000,
	max: 30,
	handler: (req, res, next, options) => {
		res.status(429).json({
			message: "Please stop bullying the server"
		})
	}
})
app.use(limiter);

// databases
mongoose.connect(DB_URI_GISMOS).then((db) => {
	console.log("connected to gismos database successfully");
}).catch((err) => {
	console.log("couldn't connect to the gismos database: code " + err.code + ", errorName " + err.codeName);
})

app.get("/", (req, res) => {
	return res.status(200).json({
		message: "Master Forky API Running"
	})
})

// ADMIN
app.post("/add-product", (req, res) => {
	const adminCode = req.body.lol;
	if (!adminCode || adminCode != process.env.ADMIN_CODE) {
		return res.status(409).json({
			message: "Unauthorised Access",
			valid: false
		})
	}

	const { title, description, price, category, outOfStock, photo } = req.body;
	
	const requiredFields = ['title', 'description', 'price', 'category', 'outOfStock', 'photo'];
	const missingFields = requiredFields.filter(field => !(field in req.body));

	// If any required field is missing, send an error response
	if (missingFields.length > 0) {
		return res.status(400).json({ error: `Missing required field(s): ${missingFields.join(', ')}` });
	}

	Product.create({
		title: title,
		description: description,
		price: price,
		category: category,
		outOfStock: outOfStock,
		photo: photo
	}).then((product) => {
		return res.status(201).json({
			message: "Product created",
			product: product,
			valid: true
		})
	}).catch((err) => {
		return res.status(500).json({
			message: "Some error occurred",
			valid: false
		})
	})
})

app.post("/register", (req, res) => {
	const name = req.body.name;
	const email = req.body.email;
	const password = req.body.password;

	if (!(name && email && password)) {
		return res.status(409).json({
			message: "missing required fields",
			fields_required: ["name", "email", "password"],
			valid: false
		})
	}

	bcrypt.hash(password, 10, (error, hashedPassword) => {
		if (error) {
			return res.status(500).json({
				message: "register failed (hash error)",
				valid: false
			})
		}

		UserGismos.create({
			name: name,
			email: email,
			password: hashedPassword
		})
			.then((data) => {
				generateToken(data._id, (err, token) => {
					if (err) {
						return res.status(500).json({
						   message: "server error",
						   valid: false
						})
					 }
						  if (token) {
							  return res.status(201).json({
								  message: "Registered Successfully",
								  user_created: data,
								  token: token,
								  valid: true
							  })
						  }
						  else {
							  return res.status(201).json({
								  message: "Registered Successfully, please login",
								  user_created: data,
								  token: false,
								  valid: true
							  })
						  }
				})
			})
			.catch((err) => {
				let message = "";

				switch (String(err.code)) {
					case "11000": message = "Email already registered"; break;
					default: message = "Some Error Occurred"; break;
				}
				
				return res.status(409).json({
					errcode: err.code,
					message: message,
					valid: false
				})
			})
	})
});

app.post("/login", (req, res) => {
	const email = req.body.email;
	const password = req.body.password;

	if (!(email && password)) {
		return res.status(400).json({
			message: "missing required fields",
			fields_required: ["email", "password"],
			valid: false
		});
	}

	UserGismos.findOne({
		email: email
	})
		.then((user) => {
			if (!user) {
				return res.status(404).json({
					message: "Invalid Login Credentials",
					valid: false
				})
			}
         
			bcrypt.compare(password, user.password)
				.then((isMatch) => {
					if (isMatch) {
						generateToken(user._id, (err, token) => {
							if (err) { // error while token generation
								return res.status(500).json({
								message: "Server Error: Login failed (tkn gen)",
								valid: false
								})
							}
							if (token) {  // token generated successfully
								return res.status(202).json({
								message: "Login Successful",
								user: {
									_id: user._id,
									name: user.name,
									email: user.email
								},
								token: token,
								valid: true
								})
							}
							else { // token generation failed -> user login failed
								return res.status(500).json({
								message: "Server Error: Login failed (tkn)",
								token: false,
								valid: false
								})
							}
						})
					}
					else {  // hashes dont match, wrong password
						return res.status(401).json({
							message: "Invalid Credentials",
							valid: false
						})
					}
				})
				.catch((err) => { // error while comparing password hashes
               return res.status(500).json({
                  message: "Server Error: Login failed (psw)",
                  valid: false
               })
            })
		})
		.catch((err) => {  // error while finding a user with given username
			return res.status(500).json({
				message: "Server Error: Login failed (db)",
				valid: false
			})
		})
});

app.post("/autologin", verifyToken, (req, res) => {
	const tokenUserId = req.tokenUserId;

	if (tokenUserId) {
		UserGismos.findById(tokenUserId)
			.then((user) => {
				const [statusCode, message] = user ? [202, "user auto logged in successfully"] : [401, "user auto login failed"];

				return res.status(statusCode).json({
					message: message,
					user: user ? {
						_id: user._id,
						name: user.name,
						email: user.email,
						cart: user.cart,
						orders: user.orders
					} : null,
					valid: user ? true : false
				})
			})
			.catch((err) => {
				return res.status(401).json({
					message: "user auto login failed: invalid user ID",
					valid: false
				})
			})
	}
	else {
		res.status(401).json({
			message: "user login failed",
			valid: false
		})
	}
})

// Product related
app.get("/get-products", (req, res) => {
	Product.find()
		.then((products) => {
			res.status(202).json({
				message: "products retrieved",
				products: products,
				valid: true
			})
		})
		.catch((err) => {
			res.json({
				message: "some error occurred",
				valid: false
			})
		})
})

app.put("/update-cart", verifyToken, (req, res) => {
	const userId = req.tokenUserId;
	const cart = req.body.cart;

	if(!cart) {
		return res.status(400).json({
			message: "missing required field",
			required: ["cart"],
			valid: false
		})
	}

	UserGismos.findByIdAndUpdate(userId, {
		cart: cart, 
	}, {new: true})
	.then((user) => {
		return res.status(200).json({
			message: "cart updated",
			user: {
				cart: user.cart,
			},
			valid: true
		})
	})
	.catch((err) => {
		return res.status(500).json({
			message: "server error",
			valid: false
		})
	})
})

app.put("/confirm-order", verifyToken, (req, res) => {
	const userId = req.tokenUserId;
	const cart = req.body.cart;
	const currentOrders = req.body.orders;

	if(!(cart && currentOrders)) {
		return res.status(400).json({
			message: "missing required fields",
			required: ["cart", "orders"],
			valid: false
		})
	}

	UserGismos.findByIdAndUpdate(userId, {
		cart: [], 
		orders: [...currentOrders, ...cart]
	}, {new: true})
	.then((user) => {
		return res.status(200).json({
			message: "Order Successfully Placed",
			user: {
				cart: user.cart,
				orders: user.orders
			},
			valid: true
		})
	})
	.catch((err) => {
		return res.status(500).json({
			message: "Order unsuccessful",
			valid: false
		})
	})
})

// Port Listener
app.listen(PORT, "0.0.0.0", () => {
    console.log(`listening to port ${PORT}`);
})