import dotenv from 'dotenv'
import jwt from 'jsonwebtoken'

dotenv.config();

export function verifyToken(req, res, next) {
    let token = req.headers.authorization;

    if(!token){
        return res.status(401).json({ 
            message: "Unauthorized action. Login again (1)",
            relogin: true,
            valid: false
        })
    }

    if (token.startsWith("Bearer ")) token = token.split(" ")[1];

    jwt.verify(token, process.env.TOKEN_SECRET_KEY_EDLEARN, (err, decodedToken) => {
        if (err) {
            return res.status(401).json({
                error: err.name,
                message: "Unauthorized action. Login again (2)",
                extra: err.message,
                relogin: true,
                valid: false
                })
        }

        req.tokenUserId = decodedToken.userId;
        next();
    })
}

export function generateToken(userId, callback) {
    return jwt.sign({ userId: userId }, process.env.TOKEN_SECRET_KEY_EDLEARN, { expiresIn: '24h'}, callback)
}