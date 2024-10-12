import cloudinary from "../lib/cloudinary.js"
import { redis } from "../lib/redis.js"
import Product from "../models/product.model.js"

export const getAllProducts = async (req, res) => {
    try {
        const products = await Product.find({}) //find all products
        res.json({ products })
    } catch (error) {
        console.log("Error in get all products controller", error.message)
        res.status(500).json({ message: "Server Error", error: error.message })
    }
}

export const getFeaturedProducts = async (req, res) => {
    try {
        let featuredProducts = await redis.get("featured-products")
        if (featuredProducts) {
            return res.json(JSON.parse(featuredProducts))
        }

        // if nor in redis, fetch from mongoDB
        // lean() can send us the plain javascript object intead of mongoDB document which is good for performance
        featuredProducts = await Product.find({ isFeatured: true }).lean();

        if (!featuredProducts) {
            return res.status(404).json({ message: "No featured products found" })
        }

        //store in redis for future quick access

        await redis.set("featured-products", JSON.stringify(featuredProducts))

        res.json(featuredProducts)
    } catch (error) {
        console.log("Error in get featured products controller", error.message);
        res.status(500).json({ message: "Server Error", error: error.message });
    }
}

export const createProduct = async (req, res) => {
    try {
        const { name, description, price, image, category } = req.body;

        let cloudinaryResponse = null

        if (image) {
            cloudinaryResponse = await cloudinary.uploader.upload(image, { folder: "products" })
        }

        const product = await Product.create({
            name,
            description,
            price,
            image: cloudinaryResponse?.secure_url ? cloudinaryResponse.secure_url : "",
            category,
        })
        res.status(201).json(product)
    } catch (error) {
        console.log("Error in create product controller", error.message);
        res.status(500).json({ message: "Server Error", error: error.message });
    }
}

export const deleteProduct = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id)
        if(!product){
            return res.status(404).json({ message: "Product not found" })
        }

        if(product.image){
            const publicId = product.image.split("/").pop().split(".")[0]
            try {
                await cloudinary.uploader.destroy(publicId)
                console.log("deleted image from cloudinary")
            } catch (error) {
                console.log("Error in deleting image from cloudinary", error.message)
            }
        }

        await Product.findByIdAndDelete(req.params.id)

        res.status(200).json({ message: "Product deleted successfully" })

    } catch (error) {
        console.log("Error in delete product controller", error.message);
        res.status(500).json({ message: "Server Error", error: error.message });
    }
}

export const getRecommendedProducts = async (req, res) => {
    try {
        const products = await Product.aggregate([
            {
                $sample: { size: 3 }
            },
            {
                $project: {
                    _id: 1,
                    name: 1,
                    description: 1,
                    price: 1,
                    image: 1
                }
            }
        ])
        res.json((products))
    } catch (error) {
        console.log("Error in get recommended products controller", error.message);
        res.status(500).json({ message: "Server Error", error: error.message });
    }
}

export const getProductsByCategory = async (req, res) => {
    const {category} = req.params;
    try {
        const products = await Product.find({category})
        res.json({products})
    } catch (error) {
        console.log("Error in get products by category controller", error.message);
        res.status(500).json({ message: "Server Error", error: error.message });
    }
}

export const toggleFeaturedProducts = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id)
        if (product) {
            product.isFeatured = !product.isFeatured
            const updatedProduct = await product.save();
            await updateFeaturedProductsCache();
            res.json(updatedProduct);
        } else{
            res.status(400).json({message:"Product not found"})
        }
    } catch (error) {
        console.log("Error in toggle featured products controller", error.message);
        res.status(500).json({ message: "Server Error", error: error.message });
    }
}

async function updateFeaturedProductsCache() {
    try {
        const featuredProducts = await Product.find({ isFeatured: true }).lean();
        await redis.set("featured-products", JSON.stringify(featuredProducts))
    } catch (error) {
        console.log("Error in update featured products cache", error.message);
    }
}