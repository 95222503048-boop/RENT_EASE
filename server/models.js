import mongoose from 'mongoose';

const cloudinaryConnectionSchema = new mongoose.Schema({
  cloudName: { type:String, trim:true, maxlength:100 },
  apiKey: { type:String, trim:true, maxlength:128 },
  secretCiphertext: { type:String, maxlength:512 },
  secretIv: { type:String, maxlength:64 },
  secretTag: { type:String, maxlength:64 },
  connectedAt: { type:Date }
}, { _id:false });

const userSchema = new mongoose.Schema({
  name: { type:String, required:true, trim:true, maxlength:80 },
  email: { type:String, required:true, unique:true, lowercase:true, trim:true, maxlength:254 },
  passwordHash: { type:String, required:true },
  tokenVersion: { type:Number, default:0 },
  phone: { type:String, default:'', trim:true, maxlength:30 },
  role: { type:String, enum:['customer','admin','developer'], default:'customer', index:true },
  storeName: { type:String, default:'', trim:true, maxlength:100 },
  storeDescription: { type:String, default:'', trim:true, maxlength:1000 },
  storeCity: { type:String, default:'', trim:true, maxlength:100 },
  storePhone: { type:String, default:'', trim:true, maxlength:30 },
  storeLogo: { type:String, default:'' },
  storeLogoPublicId: { type:String, default:'' },
  cloudinaryConnection: { type:cloudinaryConnectionSchema, default:undefined, select:false }
}, { timestamps:true });

const productSchema = new mongoose.Schema({
  owner: { type:mongoose.Schema.Types.ObjectId, ref:'User', required:true, index:true },
  name: { type:String, required:true, trim:true, maxlength:100 },
  category: { type:String, enum:['Furniture','Appliances'], required:true },
  description: { type:String, default:'', maxlength:1000 },
  monthlyRent: { type:Number, required:true, min:1 },
  deposit: { type:Number, default:0, min:0 },
  image: { type:String, required:true },
  imagePublicId: { type:String, required:true },
  available: { type:Boolean, default:true },
  active: { type:Boolean, default:true }
}, { timestamps:true });
userSchema.index({ role:1,storeName:1 });
productSchema.index({ owner:1, active:1, available:1, category:1 });

const rentalSchema = new mongoose.Schema({
  customer: { type:mongoose.Schema.Types.ObjectId, ref:'User', required:true, index:true },
  owner: { type:mongoose.Schema.Types.ObjectId, ref:'User', required:true, index:true },
  storeName: { type:String, default:'' },
  product: { type:mongoose.Schema.Types.ObjectId, ref:'Product', required:true },
  productName: { type:String, required:true },
  category: { type:String, required:true },
  monthlyRent: { type:Number, required:true },
  deposit: { type:Number, default:0 },
  status: { type:String, enum:['pending','active','maintenance','return_requested','returned'], default:'pending' },
  trackingNote: { type:String, default:'', maxlength:500 },
  deliveryAddress: { type:String, required:true, maxlength:500 },
  approvedAt: { type:Date, default:null },
  returnedAt: { type:Date, default:null }
}, { timestamps:true });
rentalSchema.index({ owner:1, status:1, createdAt:-1 });
rentalSchema.index({ owner:1, customer:1 });

export const User = mongoose.model('User', userSchema);
export const Product = mongoose.model('Product', productSchema);
export const Rental = mongoose.model('Rental', rentalSchema);

