import express, { json } from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import bcrypt from 'bcrypt';
import helmet from 'helmet';
import compression from 'compression';
import { rateLimit } from 'express-rate-limit';
import dotenv from 'dotenv';

import { verifyToken as verifyTokenGismos, generateToken as generateTokenGismos } from './middleware/authGismos.js';
import { verifyToken as verifyTokenCallMe, generateToken as generateTokenCallMe } from './middleware/authCallMe.js';
import productSchema from './schemas/productModel.js';
import userSchemaGismos from './schemas/userModelGismos.js';
import contactSchema from './schemas/contactModel.js';
import userSchemaCallMe from './schemas/userModelCallMe.js';

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;
const DB_URI_GISMOS = process.env.DB_URI_GISMOS;
const DB_URI_CALLME = process.env.DB_URI_CALLME;

app.use(cors());
app.use(json());
app.use(helmet());
app.use(compression());
const limiter = rateLimit({
	windowMs: 1 * 60 * 1000,
	max: 45,
	handler: (req, res, next, options) => {
		res.status(429).json({
			message: "Please stop bullying the server"
		})
	}
})
app.use(limiter);

// databases
const mongooseGismos = new mongoose.Mongoose();
mongooseGismos.connect(DB_URI_GISMOS).then((db) => {
	console.log("connected to gismos database successfully");
}).catch((err) => {
	console.log("couldn't connect to the gismos database: code " + err.code + ", errorName " + err.codeName);
});
const Product = mongooseGismos.model("Product", productSchema);
const UserGismos = mongooseGismos.model("User", userSchemaGismos);

const mongooseCallMe = new mongoose.Mongoose();
mongooseCallMe.connect(DB_URI_CALLME).then((db) => {
	console.log("connected to callme database successfully");
}).catch((err) => {
	console.log("couldn't connect to the callme database: code " + err.code + ", errorName " + err.codeName);
})
const Contact = mongooseCallMe.model("Contact", contactSchema);
const UserCallMe = mongooseCallMe.model("User", userSchemaCallMe);

app.get("/", (req, res) => {
	return res.status(200).json({
		message: "Master Forky API Running"
	})
})

// GISMOS API ENDPOINTS
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

app.post("/register-gismos", (req, res) => {
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
				generateTokenGismos(data._id, (err, token) => {
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

app.post("/login-gismos", (req, res) => {
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
						generateTokenGismos(user._id, (err, token) => {
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

app.post("/autologin-gismos", verifyTokenGismos, (req, res) => {
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

app.put("/update-cart", verifyTokenGismos, (req, res) => {
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

app.put("/confirm-order", verifyTokenGismos, (req, res) => {
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

// CALLME API ENDPOINTS
app.post("/register-callme", (req, res) => {
	const name = req.body.name;
	const username = req.body.username;
	const password = req.body.password;

	if (!(name && username && password)) {
		return res.status(409).json({
			message: "missing required fields",
			fields_required: ["name", "username", "password"],
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

		UserCallMe.create({
			name: name,
			username: username,
			password: hashedPassword
		})
			.then((data) => {
				generateTokenCallMe(data._id, (err, token) => {
					if (err) {
						return res.status(500).json({
						   message: "server error",
						   valid: false
						})
					 }
						  if (token) {
							  return res.status(201).json({
								  message: "user registered successfully",
								  user_created: data,
								  token: token,
								  valid: true
							  })
						  }
						  else {
							  return res.status(201).json({
								  message: "user registered but token generation failed",
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
					case "11000": message = "Username already exists"; break;
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

app.post("/login-callme", (req, res) => {
	const username = req.body.username;
	const password = req.body.password;

	if (!(username && password)) {
		return res.status(400).json({
			message: "missing required fields",
			fields_required: ["username", "password"],
			valid: false
		});
	}

	UserCallMe.findOne({
		username: username
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
						generateTokenCallMe(user._id, (err, token) => {
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
									username: user.username
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

app.post("/autologin-callme", verifyTokenCallMe, (req, res) => {
	const tokenUserId = req.tokenUserId;

	if (tokenUserId) {
		UserCallMe.findById(tokenUserId)
			.then((user) => {
				const [statusCode, message] = user ? [202, "user auto logged in successfully"] : [401, "user auto login failed"];

				return res.status(statusCode).json({
					message: message,
					user: user ? {
						_id: user._id,
						name: user.name,
						username: user.username
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

// CONTACTS API
app.get("/get-contacts", (req, res) => {
	res.status(400).json({
		message: "user ID parameter missing in URL",
		valid: false
	})
})
app.get("/get-contacts/:_userid", verifyTokenCallMe, (req, res) => {
	const userId = req.params._userid;
   const tokenUserId = req.tokenUserId;

   if (userId != tokenUserId) {
      return res.status(401).json({
         message: "unauthorised access",
         valid: false
      })
   }

	Contact.find({
		user_id: tokenUserId
	})
		.then((data) => {
			res.status(202).json({
				message: "contacts retrieved",
				list: data,
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

// CONTACT API
app.get("/get-contact", (req, res) => {
	res.status(400).json({
		message: "contact ID parameter missing in URL"
	})
})
app.get("/get-contact/:_id", verifyTokenCallMe, (req, res) => {
	const contactId = req.params._id;

	Contact.findById(contactId)
		.then((data) => {
         if (data) {
            if(data.user_id != req.tokenUserId) {
               return res.status(401).json({
                  message: "unauthorised access",
                  contact: null,
                  valid: false
               })
            }

            return res.status(202).json({
               message: "contact retrieved",
               contact: data,
               valid: true
            })
         }
         else {
            return res.status(404).json({
               message: "contact not found",
               contact: data,
               valid: false
            })
         }			
		})
		.catch((err) => {
			res.status(400).json({
				message: "invalid ID for a contact",
				valid: false
			})
		})
})

app.post("/add-contact", (req, res) => {
	res.status(400).json({
		message: "user ID parameter not specified",
		valid: false
	})
})
app.post("/add-contact/:_userid", verifyTokenCallMe, (req, res) => {
	const userId = req.params._userid;
   const tokenUserId = req.tokenUserId;

   if (userId != tokenUserId) {
      return res.status(401).json({
         message: "unauthorised access",
         valid: false
      })
   }

	UserCallMe.findById(tokenUserId)
		.then((data) => {
			if (!data) {
				return res.status(404).json({
					message: "User not found",
					valid: false
				})
			}

			const contactName = req.body.name;
			const contactNumber = req.body.ph_num;

			if (!contactName) {
				return res.status(400).json({
					message: "missing required fields",
					required: ["name"],
					optional: ["ph_num"],
					valid: false
				})
			}

			Contact.create({
				user_id: tokenUserId,
				name: contactName,
				ph_num: contactNumber
			})
				.then((data) => {
					res.status(201).json({
						message: "contact created successfully",
						added: data,
						valid: true
					})
				})
				.catch((err) => {
					res.status(500).json({
						message: "server error occurred",
						error: err,
						valid: false
					})
				})
		})
		.catch((err) => {
			res.status(404).json({
				message: "invalid user ID",
				valid: false
			})
		})
})

app.put("/update-contact", (req, res) => {
	res.status(400).json({
		message: "contact ID parameter missing from URL",
		valid: false
	})
})
app.put("/update-contact/:_id", verifyTokenCallMe, (req, res) => {
	const contactId = req.params._id;
    const tokenUserId = req.tokenUserId;
	const update = req.body.update;

	if (!update) {
		return res.status(400).json({
			message: "body missing object field `update` with optional updated contact details",
			allowedFields: "update: { name: ??? , ph_num: ??? }",
			valid: false
		})
	}
	if (update.user_id) {
		return res.status(400).json({
			message: "`update` field's object cannot contain `user_id` field",
			comments: "client tried to update contact owner",
			valid: false
		})
	}

	Contact.findOneAndUpdate({
      _id: contactId,
      user_id: tokenUserId
   }, update, { new: true })
		.then((data) => {
			const [statusCode, message] = data ? [202, "contact updated"] : [404, "no such contact found"];

			res.status(statusCode).json({
				message: message,
				updated: data,
				valid: data ? true : false
			})
		})
		.catch((err) => {
			res.status(500).json({
				message: "contact could not be updated, invalid ID",
				valid: false
			})
		})
})

app.delete("/delete-contact/:_id", verifyTokenCallMe, (req, res) => {
   const contactId = req.params._id;
   const tokenUserId = req.tokenUserId;

	Contact.findOneAndDelete({
      _id: contactId,
      user_id: tokenUserId
   })
		.then((data) => {
			const [statusCode, message] = data ? [200, "contact deleted"] : [404, "contact not found"]

			res.status(statusCode).json({
				message: message,
				target: data,
				valid: data ? true : false
			})
		})
		.catch((err) => {
			res.status(400).json({
				message: "invalid contact ID",
				valid: false
			})
		})
})

// Port Listener
app.listen(PORT, "0.0.0.0", () => {
    console.log(`listening to port ${PORT}`);
})