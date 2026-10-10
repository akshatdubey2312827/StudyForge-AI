import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const UserSchema = new mongoose.Schema({ email: String, name: String, googleId: String }, { timestamps: true });
const User = mongoose.models['User'] || mongoose.model('User', UserSchema);

await mongoose.connect(process.env.MONGODB_URI!);
const users = await User.find({}).limit(5).lean();
console.log(JSON.stringify(users.map((u: any) => ({ id: u._id, email: u.email, name: u.name })), null, 2));
process.exit(0);
