import express, { json } from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import bcrypt from 'bcrypt';
import helmet from 'helmet';
import compression from 'compression';
import { rateLimit } from 'express-rate-limit';
import dotenv from 'dotenv';
import shortid from 'shortid';
import razorpay from 'razorpay';

import { verifyToken as verifyTokenGismos, generateToken as generateTokenGismos } from './middleware/authGismos.js';
import { verifyToken as verifyTokenCallMe, generateToken as generateTokenCallMe } from './middleware/authCallMe.js';
import { verifyToken as verifyTokenEdlearn, generateToken as generateTokenEdlearn } from './middleware/authEdlearn.js';

import productSchema from './schemas/productModel.js';
import userSchemaGismos from './schemas/userModelGismos.js';

import contactSchema from './schemas/contactModel.js';
import userSchemaCallMe from './schemas/userModelCallMe.js';

import courseSchema from './schemas/courseModel.js';
import highfiveSchema from './schemas/highfiveModel.js';
import paymentSchema from './schemas/paymentModel.js';
import videoSchema from './schemas/videoModel.js';
import userSchemaEdlearn from './schemas/userModelEdlearn.js';

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;
const DB_URI_GISMOS = process.env.DB_URI_GISMOS;
const DB_URI_CALLME = process.env.DB_URI_CALLME;
const DB_URI_EDLEARN = process.env.DB_URI_EDLEARN;

const razorpayInstance = new razorpay({
    key_id: process.env.RAZOR_KEYID,
    key_secret: process.env.RAZOR_SECRET
});

app.use(cors());
app.use(json());
app.use(helmet());
app.use(compression());
const limiter = rateLimit({
	windowMs: 1 * 60 * 1000,
	max: 150,
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

const mongooseEdlearn = new mongoose.Mongoose();
mongooseEdlearn.connect(DB_URI_EDLEARN).then(db => {
	console.log("connected to edlearn database successfully");
}).catch((err) => {
	console.log("couldn't connect to the edlearn database: code " + err.code + ", errorName " + err.codeName);
})
const Course = mongooseEdlearn.model("Course", courseSchema);
const Video = mongooseEdlearn.model("Video", videoSchema);
const HighFive = mongooseEdlearn.model("HighFive", highfiveSchema);
const Payment = mongooseEdlearn.model("Payment", paymentSchema);
const UserEdlearn = mongooseEdlearn.model("User", userSchemaEdlearn);

app.get("/", (req, res) => {
	return res.status(200).json({
		message: "Master Forky API",
		supports_projects: ["callthem", "gismos", "edlearn"]
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

// EDULEARN API ENDPOINTS
app.post("/register-edlearn", (req, res) => {
    const { fullname, email, password } = req.body;

    if (!(fullname && email && password)) {
        return res.status(409).json({
            message: "missing required fields",
            fields_required: ["fullname", "email", "password"],
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

        UserEdlearn.create({
            fullname: fullname,
            email: email,
            password: hashedPassword,
            role: 'student',
            courses_bought: []
        })
            .then((data) => {
                generateTokenEdlearn(data._id, (err, token) => {
                    if (err) {
                        return res.status(500).json({
                            message: "server error",
                            valid: false
                        })
                    }
                    if (token) {
                        return res.status(201).json({
                            message: "Registered Successfully",
                            user: {
                                _id: data._id,
                                fullname: data.fullname,
                                email: data.email,
                                role: data.role,
                                courses_bought: data.courses_bought
                            },
                            token: token,
                            valid: true
                        })
                    }
                    else {
                        return res.status(201).json({
                            message: "Registered Successfully, please login",
                            user: {
                                _id: data._id,
                                fullname: data.fullname,
                                email: data.email,
                                role: data.role,
                                courses_bought: data.courses_bought
                            },
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

app.post("/login-edlearn", (req, res) => {
    const email = req.body.email;
    const password = req.body.password;

    if (!(email && password)) {
        return res.status(400).json({
            message: "missing required fields",
            fields_required: ["email", "password"],
            valid: false
        });
    }

    UserEdlearn.findOne({
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
                        generateTokenEdlearn(user._id, (err, token) => {
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
                                        fullname: user.fullname,
                                        email: user.email,
                                        role: user.role,
                                        courses_bought: user.courses_bought
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

app.post("/autologin-edlearn", verifyTokenEdlearn, (req, res) => {
    const tokenUserId = req.tokenUserId;

    if (tokenUserId) {
        UserEdlearn.findById(tokenUserId)
            .then((user) => {
                const [statusCode, message] = user ? [202, "user auto logged in successfully"] : [401, "user auto login failed"];

                return res.status(statusCode).json({
                    message: message,
                    user: user ? {
                        _id: user._id,
                        fullname: user.fullname,
                        email: user.email,
                        role: user.role,
                        courses_bought: user.courses_bought
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

// Website Related
app.get("/get-courses", (req, res) => {
    Course.find()
        .then((courses) => {
            res.status(202).json({
                message: "courses retrieved",
                data: courses,
                valid: true
            })
        })
        .catch((err) => {
            res.status(500).json({
                message: "some error occurred",
                valid: false
            })
        })
})
app.post("/get-course", (req, res) => {
    const courseId = req.body._id;
    if (!courseId) {
        return res.status(400).json({
            message: "missing required fields",
            required: ["_id"],
            valid: false
        })
    }

    Course.findById(courseId)
        .then(course => {
            if (course) {
                return res.status(202).json({
                    message: "course found",
                    data: course,
                    valid: true
                })
            }
            else {
                return res.status(404).json({
                    message: "course not found",
                    data: false,
                    valid: false
                })
            }
        })
        .catch(err => {
            return res.status(401).json({
                message: "some error occurred",
                data: false,
                valid: false
            })
        })
})
app.post("/add-course", verifyTokenEdlearn, (req, res) => {
    const userId = req.tokenUserId;

    if (!userId) {
        return res.status(403).json({
            message: "Unauthorized Access",
            valid: false
        })
    }

    UserEdlearn.findById(userId).then(data => {
        if (data) {
            if (data.role === "admin") {
                const { title, description, summary, thumbnail, instructor, cost, coming_soon } = req.body;

                if (!(summary && title && description && thumbnail != undefined && instructor && cost && coming_soon != undefined)) {
                    return res.status(403).json({
                        message: "missing required fields",
                        valid: false
                    })
                }

                Course.create({
                    title: title,
                    description: description,
                    summary: summary,
                    thumbnail: thumbnail,
                    instructor: instructor,
                    cost: cost,
                    coming_soon: coming_soon
                }).then(course => {
                    return res.status(200).json({
                        message: "course added",
                        data: course,
                        valid: true
                    })
                }).catch(err => {
                    return res.status(500).json({
                        message: "server error",
                        valid: false
                    })
                })
            }
            else {
                return res.status(403).json({
                    message: "Unauthorized Access",
                    valid: false
                })
            }
        }
        else {
            return res.status(403).json({
                message: "Unauthorized Access",
                valid: false
            })
        }
    }).catch(err => {
        return res.status(500).json({
            message: "some error occurred",
            valid: false
        })
    })
})
app.patch("/edit-course", verifyTokenEdlearn, (req, res) => {
    const userId = req.tokenUserId;

    if (!userId) {
        return res.status(403).json({
            message: "Unauthorized Access",
            valid: false
        })
    }

    UserEdlearn.findById(userId).then(data => {
        if (data) {
            if (data.role === "admin") {
                const { _id, title, description, summary, thumbnail, instructor, cost, coming_soon } = req.body;

                if (!(_id && summary && title && description && thumbnail && instructor && cost && coming_soon)) {
                    return res.status(403).json({
                        message: "missing required fields",
                        valid: false
                    })
                }

                Course.findByIdAndUpdate(_id, {
                    title: title,
                    description: description,
                    summary: summary,
                    thumbnail: thumbnail,
                    instructor: instructor,
                    cost: cost,
                    coming_soon: coming_soon
                }, { new: true }).then(course => {
                    return res.status(200).json({
                        message: "course edited",
                        data: course,
                        valid: true
                    })
                }).catch(err => {
                    return res.status(500).json({
                        message: "server error",
                        valid: false
                    })
                })
            }
            else {
                return res.status(403).json({
                    message: "Unauthorized Access",
                    valid: false
                })
            }
        }
        else {
            return res.status(403).json({
                message: "Unauthorized Access",
                valid: false
            })
        }
    }).catch(err => {
        return res.status(500).json({
            message: "some error occurred",
            valid: false
        })
    })
})
app.delete("/delete-course", verifyTokenEdlearn, (req, res) => {
    const userId = req.tokenUserId;

    if (!userId) {
        return res.status(403).json({
            message: "Unauthorized Access",
            valid: false
        })
    }

    UserEdlearn.findById(userId).then(data => {
        if (data) {
            if (data.role === "admin") {
                const _id = req.body._id;

                if (!_id) {
                    return res.status(400).json({
                        message: "missing required fields",
                        required: ["_id"],
                        valid: false
                    })
                }

                Course.findByIdAndDelete(_id).then(data => {
                    if (data) {
                        Video.deleteMany({
                            course: _id
                        }).then(data => {
                            return res.status(200).json({
                                message: "course and videos deleted",
                                valid: true
                            })
                        }).catch(err => {
                            return res.status(500).json({
                                message: "course deleted, server error",
                                valid: false
                            })
                        })
                    }
                    else {
                        return res.status(404).json({
                            message: "course not found",
                            valid: false
                        })
                    }
                }).catch(err => {
                    return res.status(500).json({
                        message: "server error",
                        valid: false
                    })
                })
            }
            else {
                return res.status(403).json({
                    message: "Unauthorized Access",
                    valid: false
                })
            }
        }
        else {
            return res.status(403).json({
                message: "Unauthorized Access",
                valid: false
            })
        }
    }).catch(err => {
        return res.status(500).json({
            message: "some error occurred",
            valid: false
        })
    })
})
app.post("/get-course-videos", verifyTokenEdlearn, (req, res) => {
    const courseId = req.body.course_id;
    const userId = req.tokenUserId;

    if (!courseId) {
        return res.status(400).json({
            message: "missing required fields",
            required: ["course_id"],
            valid: false
        })
    }

    UserEdlearn.findById(userId).then(data => {
        if ((data && data.courses_bought.includes(courseId)) || data.role === "admin") {
            Video.find({
                course: courseId
            }).then(videos => {
                return res.status(202).json({
                    message: "videos retrieved",
                    data: videos,
                    valid: true
                })
            }).catch(err => {
                return res.status(500).json({
                    message: "server error",
                    valid: false
                })
            })
        }
        else {
            return res.status(403).json({
                message: "invalid user for premium course",
                valid: false
            })
        }
    }).catch(err => {
        return res.status(500).json({
            message: "server error",
            valid: false
        })
    })
})
app.post("/add-video", verifyTokenEdlearn, (req, res) => {
    const userId = req.tokenUserId;

    if (!userId) {
        return res.status(403).json({
            message: "Unauthorized Access",
            valid: false
        })
    }

    UserEdlearn.findById(userId).then(data => {
        if (data) {
            if (data.role === "admin") {
                const { course, title, description, url, week, day } = req.body;

                if (!(course && title && description && url && week && day)) {
                    return res.status(403).json({
                        message: "missing required fields",
                        required: ["course", "title", 'description', 'url', 'week', 'day'],
                        valid: false
                    })
                }

                Course.findById(course).then(data => {
                    if (data) {
                        Video.create({
                            course: course,
                            title: title,
                            description: description,
                            url: url,
                            week: week,
                            day: day
                        }).then(video => {
                            return res.status(200).json({
                                message: "video added",
                                data: video,
                                valid: true
                            })
                        }).catch(err => {
                            return res.status(500).json({
                                message: "server error",
                                valid: false
                            })
                        })
                    }
                    else {
                        return res.status(404).json({
                            message: "course not found",
                            valid: false
                        })
                    }
                }).catch(err => {
                    return res.status(500).json({
                        message: "server error",
                        valid: false
                    })
                })
            }
            else {
                return res.status(403).json({
                    message: "Unauthorized Access",
                    valid: false
                })
            }
        }
        else {
            return res.status(403).json({
                message: "Unauthorized Access",
                valid: false
            })
        }
    }).catch(err => {
        return res.status(500).json({
            message: "some error occurred",
            valid: false
        })
    })
})
app.patch("/edit-video", verifyTokenEdlearn, (req, res) => {
    const userId = req.tokenUserId;

    if (!userId) {
        return res.status(403).json({
            message: "Unauthorized Access",
            valid: false
        })
    }

    UserEdlearn.findById(userId).then(data => {
        if (data) {
            if (data.role === "admin") {
                const { _id, course, title, description, url, week, day } = req.body;

                if (!(_id && course && title && description && url && week && day)) {
                    return res.status(403).json({
                        message: "missing required fields",
                        valid: false
                    })
                }

                Video.findByIdAndUpdate(_id, {
                    course: course,
                    title: title,
                    description: description,
                    url: url,
                    week: week,
                    day: day
                }, { new: true }).then(video => {
                    return res.status(200).json({
                        message: "video edited",
                        data: video,
                        valid: true
                    })
                }).catch(err => {
                    return res.status(500).json({
                        message: "server error",
                        valid: false
                    })
                })
            }
            else {
                return res.status(403).json({
                    message: "Unauthorized Access",
                    valid: false
                })
            }
        }
        else {
            return res.status(403).json({
                message: "Unauthorized Access",
                valid: false
            })
        }
    }).catch(err => {
        return res.status(500).json({
            message: "some error occurred",
            valid: false
        })
    })
})
app.delete("/delete-video", verifyTokenEdlearn, (req, res) => {
    const userId = req.tokenUserId;

    if (!userId) {
        return res.status(403).json({
            message: "Unauthorized Access",
            valid: false
        })
    }

    UserEdlearn.findById(userId).then(data => {
        if (data) {
            if (data.role === "admin") {
                const _id = req.body._id;

                if (!_id) {
                    return res.status(400).json({
                        message: "missing required fields",
                        required: ["_id"],
                        valid: false
                    })
                }

                Video.findByIdAndDelete(_id).then(data => {
                    if (data) {
                        return res.status(200).json({
                            message: "video deleted",
                            valid: true
                        })
                    }
                    else {
                        return res.status(404).json({
                            message: "video not found",
                            valid: false
                        })
                    }
                }).catch(err => {
                    return res.status(500).json({
                        message: "server error",
                        valid: false
                    })
                })
            }
            else {
                return res.status(403).json({
                    message: "Unauthorized Access",
                    valid: false
                })
            }
        }
        else {
            return res.status(403).json({
                message: "Unauthorized Access",
                valid: false
            })
        }
    }).catch(err => {
        return res.status(500).json({
            message: "some error occurred",
            valid: false
        })
    })
})

app.get("/get-users", verifyTokenEdlearn, (req, res) => {
    const userId = req.tokenUserId;

    if (!userId) {
        return res.status(403).json({
            message: "Unauthorized Access",
            valid: false
        })
    }

    UserEdlearn.findById(userId).then(data => {
        if (data) {
            if (data.role === "admin") {
                UserEdlearn.find().then(users => {
                    return res.status(202).json({
                        message: "users retrieved",
                        data: users.map(user => { return { fullname: user.fullname, email: user.email, role: user.role, courses_bought: user.courses_bought } }),
                        valid: true
                    })
                })
                    .catch(err => {
                        return res.status(500).json({
                            message: "some error occurred",
                            valid: false
                        })
                    })
            }
            else {
                return res.status(403).json({
                    message: "Unauthorized Access",
                    valid: false
                })
            }
        }
        else {
            return res.status(403).json({
                message: "Unauthorized Access",
                valid: false
            })
        }
    }).catch(err => {
        return res.status(500).json({
            message: "some error occurred",
            valid: false
        })
    })
})
app.get("/get-payments", verifyTokenEdlearn, (req, res) => {
    const userId = req.tokenUserId;

    UserEdlearn.findById(userId).then(data => {
        if (data) {
            if (data.role === "admin") {
                Payment.find().then(payments => {
                    return res.status(202).json({
                        message: "payments retrieved",
                        data: payments,
                        valid: true
                    })
                }).catch(err => {return res.status(500).json({message: "server error", valid: false})})
            }
            else {
                Payment.find({
                    user_id: userId
                }).then(payments => {
                    return res.status(202).json({
                        message: "payments retrieved",
                        data: payments,
                        valid: true
                    })
                }).catch(err => {return res.status(500).json({message: "server error", valid: false})})
            }
        }
        else {
            return res.status(404).json({
                message: "Unauthorised access",
                valid: false
            })
        }
    }).catch(err => {return res.status(500).json({message: "server error", valid: false})})
})

app.post("/razorpay", verifyTokenEdlearn, (req, res) => {
    const payment_capture = 1; // 1 means payment should be captured immediately
    const amount = req.body?.cost;

    if (!amount) {
        return res.status(400).json({
            message: "missing required fields",
            required: ["cost", "course_id", "user_id"]
        })
    }

    const currency = 'INR';
    const option = {
        amount: amount * 100,
        currency: currency,
        receipt: shortid.generate(),
        payment_capture
    };

    razorpayInstance.orders.create(option).then(data => {
        return res.status(200).json({
            message: "order received",
            id: data.id,
            currency: data.currency,
            amount: data.amount,
            valid: true
        })
    }).catch(err => {
        console.log(err);
        return res.status(500).json({
            message: "some error occurred",
            valid: false
        })
    })
})
app.patch("/buy-course", verifyTokenEdlearn, (req, res) => {
    const { course_id, payment_id, cost } = req.body;
    const userId = req.tokenUserId;

    if (!course_id || !payment_id || !cost) {
        return res.status(400).json({
            message: "missing required fields",
            required: ["course_id", "payment_id", "cost"],
            valid: false
        })
    }

    UserEdlearn.findById(userId).then(data => {
        if (data) {
            if (data.courses_bought.includes(course_id)) {
                return res.status(200).json({
                    message: "course already bought",
                    data: data,
                    valid: true
                })
            }
            UserEdlearn.findByIdAndUpdate(userId, {
                courses_bought: [...data.courses_bought, course_id]
            }, { new: true }).then(user => {
                if (user) {
                    return res.status(200).json({
                        message: "course bought successfully",
                        data: user,
                        valid: true
                    })
                }
            }).catch(err => {
                return res.status(500).json({
                    message: "server error",
                    valid: false
                })
            })

            Payment.create({
                user_id: userId,
                course_id: course_id,
                success: true,
                payment_id: payment_id,
                amount: cost
            }).then(data => {
                console.log("Payment successful, by " + userId + " for course " + course_id);
            }).catch(err => {
                console.log(err);
            })
        }
        else {
            return res.status(403).json({
                message: "unauthorized action",
                valid: false
            })
        }
    }).catch(err => {
        return res.status(500).json({
            message: "server error",
            valid: false
        })
    })
})

app.get("/get-highfives", verifyTokenEdlearn, (req, res) => {
    const userId = req.tokenUserId;

    if (!userId) {
        return res.status(403).json({
            message: "Unauthorized Access",
            valid: false
        })
    }

    UserEdlearn.findById(userId).then(data => {
        if (data) {
            if (data.role === "admin") {
                HighFive.find().then(highfives => {
                    return res.status(202).json({
                        message: "highfives retrieved",
                        data: highfives,
                        valid: false
                    })
                })
            }
            else {
                return res.status(403).json({
                    message: "Unauthorized Access",
                    valid: false
                })
            }
        }
        else {
            return res.status(403).json({
                message: "Unauthorized Access",
                valid: false
            })
        }
    }).catch(err => {
        return res.status(500).json({
            message: "some error occurred",
            valid: false
        })
    })
})
app.post("/post-highfive", (req, res) => {
    const { fullname, email, message } = req.body;

    if (!(fullname && email && message)) {
        return res.status(400).json({
            message: "missing required fields",
            required: ["fullname", "email", "message"],
            valid: false
        })
    }

    HighFive.create({
        fullname: fullname,
        email: email,
        message: message
    }).then(data => {
        return res.status(200).json({
            message: "highfive recorded",
            valid: true
        })
    }).catch(err => {
        return res.status(500).json({
            message: "some error occurred",
            valid: false
        })
    })
})

// Port Listener
app.listen(PORT, "0.0.0.0", () => {
    console.log(`listening to port ${PORT}`);
})