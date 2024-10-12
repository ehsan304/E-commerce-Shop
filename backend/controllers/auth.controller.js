import { redis } from "../lib/redis.js"
import User from "../models/user.model.js"
import jwt from "jsonwebtoken"

const generateTokens = (userId) => {
    const accessToken = jwt.sign({ userId }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: "15m" })
    const refreshToken = jwt.sign({ userId }, process.env.REFRESH_TOKEN_SECRET, { expiresIn: "7d" })
    return { accessToken, refreshToken }
}

// Storing refresh token in redis for 7 days
const storeRefreshToken = async (userId, refreshToken) => {
    await redis.set(`refresh_token:${userId}`, refreshToken, "EX", 60 * 60 * 24 * 7); // 7 days
}

// Setting cookies
const setCookies = (res, accessToken, refreshToken) => {
    res.cookie("accessToken", accessToken, {
        httpOnly: true, //prevent XSS attacks, cross site scripting attack
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict", //prevents CSRF attack, cross-site request forgeru attack
        maxAge: 15 * 60 * 1000, // 15 minutes
    })
    res.cookie("refreshToken", refreshToken, {
        httpOnly: true, //prevent XSS attacks, cross site scripting attack
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict", //prevents CSRF attack, cross-site request forgeru attack
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    })
}


export const signup = async (req, res) => {
    const { name, email, password } = req.body;

    try {
        const userExists = await User.findOne({ email });
        if (userExists) {
            return res.status(400).json({ message: "User already exist" })
        }

        const user = await User.create({ name, email, password });

        //authenticate user and generate token 
        const { accessToken, refreshToken } = generateTokens(user._id);
        await storeRefreshToken(user._id, refreshToken)

        setCookies(res, accessToken, refreshToken)
        res.status(201).json({
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role
            }, message: "User created successfully"
        })

    } catch (error) {
        console.log("Error in signup controller", error.message);
        res.status(500).json({ message: error.message })
    }

}
export const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });

        if (user && (await user.comparePassword(password))) {
            const { accessToken, refreshToken } = generateTokens(user._id);

            await storeRefreshToken(user._id, refreshToken);
            setCookies(res, accessToken, refreshToken);
            res.status(200).json({
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
            })
        } else {
            res.status(401).json({ message: "Invalid email or password" })
        }
    } catch (error) {
        console.log("Error in login controller", error.message);
        res.status(500).json({ message: error.message })
    }
}
export const logout = async (req, res) => {
    try {
        const refreshToken = req.cookies.refreshToken
        if (refreshToken) {
            const decode = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET)
            await redis.del(`refresh_token:${decode.userId}`)
        }
        res.clearCookie("accessToken")
        res.clearCookie("refreshToken")
        res.json({ message: "Logged out successfully" })
    } catch (error) {
        console.log("Error in logout controller", error.message);
        res.status(500).json({ message: "Server error", error: error.message })
    }
}

// this will refresh the access token

export const refreshToken = async (req, res) => {
    try {
        const refreshToken = req.cookies.refreshToken

        if (!refreshToken) {
            return res.status(401).json({ message: "No refresh token provided" })
        }
        const decode = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);

        const storedToken = await redis.get(`refresh_token:${decode.userId}`);
        if (storedToken !== refreshToken) {
            return res.status(401).json({ message: "Invalid refresh token" })
        }

        const accessToken = jwt.sign({ userId: decode.userId }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: "15m" });
        res.cookie("accessToken", accessToken, {
            httpOnly: true, //prevent XSS attacks, cross site scripting attack
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict", //prevents CSRF attack, cross-site request forgeru attack
            maxAge: 15 * 60 * 1000, // 15 minutes
        })
        res.json({ message: "Token refreshed successfully" })
    } catch (error) {
        console.log("Error in refreshToken controller", error.message);
        res.status(500).json({message: "Server error", error:error.message})
    }
}

export const getProfile = async (req, res)=>{
    try {
        res.json(req.user)
    } catch (error) {
        res.status(500).json({message: "Server error", error:error.message})
    }
}