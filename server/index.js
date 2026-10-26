import 'express-async-errors';
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { verifyCloudinaryThenPersist, uploadCloudinaryImage, safeCloudinaryError } from './cloudinary.js';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { User, Product, Rental } from './models.js';

const app = express();
const port = Number(process.env.PORT || 10000);
const isProduction = process.env.NODE_ENV === 'production';
const origins = process.env.CLIENT_ORIGIN?.split(',').map((x) => x.trim().replace(/\/+$/,'')).filter(Boolean);
const proxyHops = Number(process.env.TRUST_PROXY ?? 1);
app.set('trust proxy', isProduction && Number.isInteger(proxyHops) && proxyHops > 0 ? proxyHops : false);
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: { directives: { imgSrc:["'self'",'data:','https:'], upgradeInsecureRequests:isProduction ? [] : null } } }));
if (origins?.length) app.use(cors({ origin:origins }));
app.use(express.json({ limit:'100kb', strict:true }));
const fail = (res, status, message) => res.status(status).json({ error:message });
const apiLimiter = rateLimit({ windowMs:15*60*1000, limit:300, standardHeaders:true, legacyHeaders:false, message:{ error:'Too many requests. Please try again later.' } });
const authLimiter = rateLimit({ windowMs:15*60*1000, limit:10, standardHeaders:true, legacyHeaders:false, message:{ error:'Too many sign-in attempts. Please wait and try again.' } });
const imageLimiter = rateLimit({ windowMs:15*60*1000, limit:20, standardHeaders:true, legacyHeaders:false, message:{ error:'Too many image uploads. Please try again later.' } });
const cloudinaryConnectionLimiter = rateLimit({ windowMs:15*60*1000, limit:5, standardHeaders:true, legacyHeaders:false, message:{ error:'Too many Cloudinary connection attempts. Please try again later.' } });
const accountActionLimiter = rateLimit({ windowMs:15*60*1000, limit:5, standardHeaders:true, legacyHeaders:false, message:{ error:'Too many account security attempts. Please try again later.' } });
app.use('/api', apiLimiter);
app.use('/api/auth', authLimiter);

const imageUpload = multer({
  storage:multer.memoryStorage(),
  limits:{ fileSize:5*1024*1024, files:1, fields:0, parts:1 },
  fileFilter:(_req,file,cb) => ['image/jpeg','image/png','image/webp','image/avif'].includes(file.mimetype) ? cb(null,true) : cb(new Error('Unsupported image type'))
});
function hasSupportedImageSignature(file) {
  const b=file?.buffer,mime=file?.mimetype;
  if (!Buffer.isBuffer(b) || b.length<12) return false;
  if (mime==='image/jpeg') return b[0]===0xff && b[1]===0xd8 && b[2]===0xff;
  if (mime==='image/png') return b.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));
  if (mime==='image/webp') return b.toString('ascii',0,4)==='RIFF' && b.toString('ascii',8,12)==='WEBP';
  if (mime==='image/avif') return b.toString('ascii',4,8)==='ftyp' && ['avif','avis','mif1','msf1'].includes(b.toString('ascii',8,12));
  return false;
}
function encryptionKey() {
  const value=process.env.CLOUDINARY_CREDENTIALS_KEY||'';
  if (!/^[a-f0-9]{64}$/i.test(value)) return null;
  return Buffer.from(value,'hex');
}
function encryptSecret(secret) {
  const key=encryptionKey();
  if (!key) return null;
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
  const ciphertext=Buffer.concat([cipher.update(secret,'utf8'),cipher.final()]);
  return { secretCiphertext:ciphertext.toString('base64'),secretIv:iv.toString('base64'),secretTag:cipher.getAuthTag().toString('base64') };
}
function decryptCloudinarySecret(connection) {
  const key=encryptionKey();
  if (!key || !connection?.secretCiphertext || !connection?.secretIv || !connection?.secretTag) return null;
  try {
    const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(connection.secretIv,'base64'));
    decipher.setAuthTag(Buffer.from(connection.secretTag,'base64'));
    return Buffer.concat([decipher.update(Buffer.from(connection.secretCiphertext,'base64')),decipher.final()]).toString('utf8');
  } catch { return null; }
}
function cloudinaryCredentials(connection) {
  const api_secret=decryptCloudinarySecret(connection);
  if (!api_secret || !connection?.cloudName || !connection?.apiKey) return null;
  return { cloud_name:connection.cloudName,api_key:connection.apiKey,api_secret,secure:true };
}
function cleanText(value, maxLength) {
  if (typeof value !== 'string') return null;
  return value.normalize('NFKC').replace(/<[^>]*>/g,'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,maxLength);
}
function validEmail(value) { return typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()); }
function validId(value) { return typeof value === 'string' && /^[0-9a-f]{24}$/i.test(value); }
function cleanPhone(value) {
  if (typeof value !== 'string') return null;
  const phone = value.trim().replace(/[\s().-]/g,'');
  return /^\+?[0-9]{7,15}$/.test(phone) ? phone : null;
}
function parseMoney(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !/^\d+(?:\.\d{1,2})?$/.test(value.trim())) return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}
function rentalView(r) {
  const start = r.approvedAt ? new Date(r.approvedAt) : null;
  const stop = r.returnedAt ? new Date(r.returnedAt) : new Date();
  const days = start && !['pending'].includes(r.status) ? Math.floor(Math.max(0,stop-start)/86_400_000) : 0;
  const dailyRate = r.monthlyRent/30;
  const customer = r.customer?.email ? { id:r.customer.id, name:r.customer.name, email:r.customer.email, phone:r.customer.phone } : r.customer;
  return { ...r.toObject(), customer, days, dailyRate, accruedRent:Math.round(days*dailyRate*100)/100 };
}
const safeUser = (u) => ({ id:u.id, name:u.name, email:u.email, phone:u.phone, role:u.role });
const safeAdminProfile = (u) => ({ id:u.id, name:u.name, storeName:u.storeName, storeDescription:u.storeDescription, storeCity:u.storeCity, storePhone:u.storePhone, storeLogo:u.storeLogo||'' });
const auth = async (req,res,next) => {
  try {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i,'');
    if (!token) return fail(res,401,'Please sign in to continue.');
    const payload = jwt.verify(token,process.env.JWT_SECRET,{ algorithms:['HS256'] });
    req.user = await User.findById(payload.sub).select('name email phone role storeName storeDescription storeCity storePhone storeLogo storeLogoPublicId tokenVersion');
    if (!req.user) return fail(res,401,'Account not found.');
    if ((payload.ver??0)!==(req.user.tokenVersion||0)) return fail(res,401,'Your session is invalid or has expired. Please sign in again.');
    next();
  } catch { return fail(res,401,'Your session is invalid or has expired. Please sign in again.'); }
};
const allowRoles = (...roles) => (req,res,next) => roles.includes(req.user?.role) ? next() : fail(res,403,'You are not allowed to use this feature.');
const customerOnly = allowRoles('customer');
const adminOnly = allowRoles('admin');
const developerOnly = allowRoles('developer');
const tokenFor = (user) => jwt.sign({ sub:user.id,ver:user.tokenVersion||0 },process.env.JWT_SECRET,{ expiresIn:'7d', algorithm:'HS256' });

app.get('/',(_req,res) => res.json({ service:'RentEase API',ok:true,health:'/api/health' }));
app.get('/api/health',(_req,res) => {
  const ready = mongoose.connection.readyState === 1;
  res.status(ready ? 200 : 503).json({ ok:ready });
});
app.post('/api/auth/register',async (req,res) => {
  const name=cleanText(req.body?.name,80), email=typeof req.body?.email==='string'?req.body.email.trim().toLowerCase():'', password=req.body?.password, phone=cleanPhone(req.body?.phone);
  if (!name || name.length<2 || !validEmail(email) || typeof password!=='string' || password.length<8 || Buffer.byteLength(password,'utf8')>72 || !phone) return fail(res,400,'Enter a valid name, email, phone number, and password (8–72 bytes).');
  if (await User.exists({ email })) return fail(res,409,'An account with this email already exists.');
  const user=await User.create({ name,email,phone,passwordHash:await bcrypt.hash(password,12),role:'customer' });
  res.status(201).json({ token:tokenFor(user),user:safeUser(user) });
});
app.post('/api/auth/login',async (req,res) => {
  const email=typeof req.body?.email==='string'?req.body.email.trim().toLowerCase():'', password=req.body?.password;
  if (!validEmail(email) || typeof password!=='string' || Buffer.byteLength(password,'utf8')>72) return fail(res,401,'Email or password is incorrect.');
  const user=await User.findOne({ email });
  if (!user || !(await bcrypt.compare(password,user.passwordHash))) return fail(res,401,'Email or password is incorrect.');
  res.json({ token:tokenFor(user),user:safeUser(user) });
});
app.get('/api/auth/me',auth,(req,res) => res.json({ user:safeUser(req.user) }));
app.post('/api/auth/change-password',auth,accountActionLimiter,async (req,res) => {
  const currentPassword=req.body?.currentPassword,newPassword=req.body?.newPassword;
  if (typeof currentPassword!=='string' || Buffer.byteLength(currentPassword,'utf8')>72 || typeof newPassword!=='string' || newPassword.length<8 || Buffer.byteLength(newPassword,'utf8')>72) return fail(res,400,'Enter your current password and a new password between 8 and 72 bytes.');
  const account=await User.findById(req.user.id).select('+passwordHash');
  if (!account || !(await bcrypt.compare(currentPassword,account.passwordHash))) return fail(res,400,'Current password is incorrect.');
  if (await bcrypt.compare(newPassword,account.passwordHash)) return fail(res,400,'Choose a new password different from your current password.');
  const passwordHash=await bcrypt.hash(newPassword,12);
  const updated=await User.findOneAndUpdate({ _id:account._id,passwordHash:account.passwordHash },{ $set:{ passwordHash },$inc:{ tokenVersion:1 } },{ new:true });
  if (!updated) return fail(res,409,'Your password changed in another request. Please sign in and try again.');
  res.json({ changed:true,token:tokenFor(updated) });
});

app.delete('/api/account',auth,accountActionLimiter,async (req,res) => {
  if (!['customer','admin'].includes(req.user.role)) return fail(res,403,'This account cannot be deleted here.');
  const password=req.body?.password;
  const account=await User.findById(req.user.id).select('+passwordHash');
  if (typeof password!=='string' || Buffer.byteLength(password,'utf8')>72 || !account || !(await bcrypt.compare(password,account.passwordHash))) return fail(res,400,'Password is incorrect.');
  const openStatuses={ $in:['pending','active','maintenance','return_requested'] };
  if (req.user.role==='admin') {
    if (await Rental.exists({ owner:req.user.id,status:openStatuses })) return fail(res,409,'Resolve all open rental requests before deleting this shop account.');
    await Product.deleteMany({ owner:req.user.id });
    await User.deleteOne({ _id:req.user.id,role:'admin' });
  } else {
    if (await Rental.exists({ customer:req.user.id,status:{ $in:['active','maintenance','return_requested'] } })) return fail(res,409,'Active rentals must be returned before deleting your account.');
    const pending=await Rental.find({ customer:req.user.id,status:'pending' }).select('product owner').lean();
    await Rental.deleteMany({ customer:req.user.id });
    await Promise.all(pending.map((r)=>Product.findOneAndUpdate({ _id:r.product,owner:r.owner },{ $set:{ available:true } })));
    await User.deleteOne({ _id:req.user.id,role:'customer' });
  }
  res.json({ deleted:true });
});
app.get('/api/admins',async (_req,res) => {
  const [admins,customerGroups,productCounts]=await Promise.all([
    User.find({ role:'admin',storeName:{ $type:'string',$ne:'' },storeDescription:{ $type:'string',$ne:'' },storeCity:{ $type:'string',$ne:'' },storePhone:{ $type:'string',$ne:'' } }).select('name storeName storeDescription storeCity storePhone storeLogo').limit(200).lean(),
    Rental.aggregate([{ $group:{ _id:{ owner:'$owner',customer:'$customer' } } },{ $group:{ _id:'$_id.owner',count:{ $sum:1 } } }]),
    Product.aggregate([{ $match:{ active:true } },{ $group:{ _id:'$owner',count:{ $sum:1 } } }])
  ]);
  const customers=new Map(customerGroups.map((x)=>[String(x._id),x.count]));
  const products=new Map(productCounts.map((x)=>[String(x._id),x.count]));
  const result=admins.map((a)=>({ id:String(a._id),name:a.name,storeName:a.storeName,storeDescription:a.storeDescription,storeCity:a.storeCity,storePhone:a.storePhone,storeLogo:a.storeLogo,customerCount:customers.get(String(a._id))||0,productCount:products.get(String(a._id))||0 }));
  result.sort((a,b)=>b.customerCount-a.customerCount || a.storeName.localeCompare(b.storeName));
  res.set('Cache-Control','public, max-age=20, stale-while-revalidate=40');
  res.json(result);
});
app.get('/api/products',async (req,res) => {
  const { adminId }=req.query;
  if (!validId(adminId)) return fail(res,400,'Choose a valid rental shop.');
  const shop=await User.exists({ _id:adminId,role:'admin',storeName:{ $type:'string',$ne:'' },storeDescription:{ $type:'string',$ne:'' },storeCity:{ $type:'string',$ne:'' },storePhone:{ $type:'string',$ne:'' } });
  if (!shop) return fail(res,404,'Rental shop not found.');
  const products=await Product.find({ owner:adminId,active:true }).select('name category description monthlyRent deposit image available').sort({ createdAt:-1 }).limit(60).lean();
  res.set('Cache-Control','public, max-age=20, stale-while-revalidate=40');
  res.json(products);
});
app.post('/api/rentals',auth,customerOnly,async (req,res) => {
  const { productId }=req.body||{}, deliveryAddress=cleanText(req.body?.deliveryAddress,500), phone=cleanPhone(req.body?.phone);
  if (!validId(productId) || !deliveryAddress || deliveryAddress.length<5 || !phone) return fail(res,400,'Choose a product, enter a valid delivery address, and add a phone number for the shop to call.');
  const product=await Product.findOneAndUpdate({ _id:productId,active:true,available:true },{ $set:{ available:false } },{ new:true });
  if (!product) return fail(res,409,'This item was just reserved. Please choose another one.');
  const shop=await User.findOne({ _id:product.owner,role:'admin' }).select('storeName');
  if (!shop) { await Product.findByIdAndUpdate(product.id,{ $set:{ available:true } }); return fail(res,409,'This rental shop is unavailable.'); }
  try {
    await User.findByIdAndUpdate(req.user.id,{ $set:{ phone } });
    const rental=await Rental.create({ customer:req.user.id,owner:product.owner,storeName:shop.storeName,product:product.id,productName:product.name,category:product.category,monthlyRent:product.monthlyRent,deposit:product.deposit,deliveryAddress });
    res.status(201).json({ rental:rentalView(rental) });
  } catch(error) { await Product.findByIdAndUpdate(product.id,{ $set:{ available:true } }); throw error; }
});
app.get('/api/rentals/mine',auth,customerOnly,async (req,res) => {
  const rentals=await Rental.find({ customer:req.user.id }).sort({ createdAt:-1 }).limit(100);
  res.json(rentals.map(rentalView));
});
app.patch('/api/rentals/:id/return',auth,customerOnly,async (req,res) => {
  if (!validId(req.params.id)) return fail(res,400,'Invalid rental ID.');
  const rental=await Rental.findOneAndUpdate({ _id:req.params.id,customer:req.user.id,status:'active' },{ $set:{ status:'return_requested' } },{ new:true });
  if (!rental) return fail(res,404,'Active rental not found.');
  res.json({ rental:rentalView(rental) });
});

app.get('/api/admin/profile',auth,adminOnly,(req,res) => res.json({ profile:safeAdminProfile(req.user) }));
app.patch('/api/admin/profile',auth,adminOnly,async (req,res) => {
  const name=cleanText(req.body?.name,80),storeName=cleanText(req.body?.storeName,100),storeDescription=cleanText(req.body?.storeDescription,1000),storeCity=cleanText(req.body?.storeCity,100),storePhone=cleanPhone(req.body?.storePhone);
  if (!name || name.length<2 || !storeName || storeName.length<2 || !storeDescription || !storeCity || !storePhone) return fail(res,400,'Complete your name, shop name, description, city, and contact phone.');
  const updated=await User.findByIdAndUpdate(req.user.id,{ $set:{ name,storeName,storeDescription,storeCity,storePhone } },{ new:true,runValidators:true }).select('name email phone role storeName storeDescription storeCity storePhone storeLogo');
  res.json({ profile:safeAdminProfile(updated) });
});
app.post('/api/admin/profile/image',auth,adminOnly,imageLimiter,imageUpload.single('image'),async (req,res) => {
  if (!req.file || !hasSupportedImageSignature(req.file)) return fail(res,400,'Choose a valid JPEG, PNG, WebP, or AVIF image up to 5 MB.');
  const account=await User.findById(req.user.id).select('+cloudinaryConnection').lean();
  const credentials=cloudinaryCredentials(account?.cloudinaryConnection);
  if (!credentials) return fail(res,409,'Connect your Cloudinary account before uploading a profile photo.');
  const folder='rentease/admins/'+req.user.id+'/profile';
  let result;
  try { result=await uploadCloudinaryImage(req.file.buffer,credentials,folder,{ captureResponse:!isProduction }); }
  catch (error) {
    if (!isProduction) console.warn('Admin profile image upload failed:',safeCloudinaryError(error,credentials));
    return fail(res,500,'Profile photo upload failed. Please try again.');
  }
  const storeLogo=cloudinary.url(result.public_id,{ cloud_name:credentials.cloud_name,secure:true,transformation:[{ width:500,height:500,crop:'fill',gravity:'face',quality:'auto',fetch_format:'auto' }] });
  const updated=await User.findOneAndUpdate({ _id:req.user.id,role:'admin' },{ $set:{ storeLogo,storeLogoPublicId:result.public_id } },{ new:true,runValidators:true }).select('name email phone role storeName storeDescription storeCity storePhone storeLogo');
  if (!updated) return fail(res,404,'Admin account not found.');
  res.status(201).json({ profile:safeAdminProfile(updated) });
});
app.delete('/api/admin/profile/image',auth,adminOnly,imageLimiter,async (req,res) => {
  const updated=await User.findOneAndUpdate({ _id:req.user.id,role:'admin' },{ $set:{ storeLogo:'',storeLogoPublicId:'' } },{ new:true,runValidators:true }).select('name email phone role storeName storeDescription storeCity storePhone storeLogo');
  if (!updated) return fail(res,404,'Admin account not found.');
  res.json({ profile:safeAdminProfile(updated) });
});
app.get('/api/admin/products',auth,adminOnly,async (req,res) => {
  const products=await Product.find({ owner:req.user.id }).sort({ createdAt:-1 }).limit(100).lean();
  res.json(products);
});
app.get('/api/admin/cloudinary',auth,adminOnly,async (req,res) => {
  const account=await User.findById(req.user.id).select('+cloudinaryConnection').lean();
  const c=account?.cloudinaryConnection;
  res.set('Cache-Control','no-store');
  res.json({ connected:Boolean(c?.cloudName && c?.apiKey && decryptCloudinarySecret(c)),cloudName:c?.cloudName||'',connectedAt:c?.connectedAt||null });
});
app.post('/api/admin/cloudinary/connect',auth,adminOnly,cloudinaryConnectionLimiter,async (req,res) => {
  if (isProduction && !req.secure) return fail(res,400,'Use a secure HTTPS connection to connect Cloudinary.');
  const cloudName=typeof req.body?.cloudName==='string'?req.body.cloudName.trim().toLowerCase():'';
  const apiKey=typeof req.body?.apiKey==='string'?req.body.apiKey.trim():'';
  const apiSecret=typeof req.body?.apiSecret==='string'?req.body.apiSecret.trim():'';
  if (!/^[a-z0-9][a-z0-9-]{0,98}[a-z0-9]$|^[a-z0-9]$/.test(cloudName) || !/^[a-zA-Z0-9_-]{8,128}$/.test(apiKey) || !/^[a-zA-Z0-9_-]{16,128}$/.test(apiSecret)) return fail(res,400,'Enter a valid Cloudinary cloud name, API key, and API secret.');
  const encrypted=encryptSecret(apiSecret);
  if (!encrypted) return fail(res,503,'Secure Cloudinary connections are not configured. Please contact the platform operator.');
  const credentials={ cloud_name:cloudName,api_key:apiKey,api_secret:apiSecret,secure:true };
  const connection=await verifyCloudinaryThenPersist(credentials,() => User.findOneAndUpdate({ _id:req.user.id,role:'admin' },{ $set:{ cloudinaryConnection:{ cloudName,apiKey,...encrypted,connectedAt:new Date() } } }));
  if (!connection.ok) {
    if (!isProduction) console.warn('Cloudinary credential verification failed:',safeCloudinaryError(connection.error,credentials));
    return fail(res,400,'Cloudinary could not verify those credentials. Check the cloud name, API key, and API secret.');
  }
  res.set('Cache-Control','no-store');
  res.json({ connected:true,cloudName });
});
app.delete('/api/admin/cloudinary/connect',auth,adminOnly,cloudinaryConnectionLimiter,async (req,res) => {
  await User.findOneAndUpdate({ _id:req.user.id,role:'admin' },{ $unset:{ cloudinaryConnection:1 } });
  res.json({ connected:false });
});
app.post('/api/admin/images',auth,adminOnly,imageLimiter,imageUpload.single('image'),async (req,res) => {
  if (!req.file || !hasSupportedImageSignature(req.file)) return fail(res,400,'Choose a valid JPEG, PNG, WebP, or AVIF image up to 5 MB.');
  const account=await User.findById(req.user.id).select('+cloudinaryConnection').lean();
  const credentials=cloudinaryCredentials(account?.cloudinaryConnection);
  if (!credentials) return fail(res,409,'Connect a working Cloudinary account before uploading product photos.');
  const folder='rentease/admins/'+req.user.id+'/products';
  let result;
  try { result=await uploadCloudinaryImage(req.file.buffer,credentials,folder,{ captureResponse:!isProduction }); }
  catch (error) {
    if (!isProduction) console.warn('Cloudinary image upload failed:',safeCloudinaryError(error,credentials));
    return fail(res,500,'Image upload failed. Please try again.');
  }
  const url=cloudinary.url(result.public_id,{ cloud_name:credentials.cloud_name,secure:true,transformation:[{ width:900,height:700,crop:'limit',quality:'auto',fetch_format:'auto' }] });
  res.status(201).json({ url,publicId:result.public_id });
});
app.post('/api/admin/products',auth,adminOnly,async (req,res) => {
  const name=cleanText(req.body?.name,100),category=req.body?.category,description=cleanText(req.body?.description??'',1000),monthlyRent=parseMoney(req.body?.monthlyRent),deposit=req.body?.deposit===undefined||req.body?.deposit===''?0:parseMoney(req.body.deposit),image=typeof req.body?.image==='string'?req.body.image.trim():'',imagePublicId=typeof req.body?.imagePublicId==='string'?req.body.imagePublicId.trim():'';
  const account=await User.findById(req.user.id).select('+cloudinaryConnection').lean();
  const cloudName=account?.cloudinaryConnection?.cloudName||'';
  const imageBelongsToAdmin=Boolean(cloudName && image.startsWith('https://res.cloudinary.com/'+cloudName+'/image/upload/') && imagePublicId.startsWith('rentease/admins/'+req.user.id+'/products/'));
  if (!name || !['Furniture','Appliances'].includes(category) || description===null || monthlyRent===null || monthlyRent<=0 || monthlyRent>10_000_000 || deposit===null || deposit<0 || deposit>10_000_000 || !imageBelongsToAdmin) return fail(res,400,'Check the product details and upload its image to your connected Cloudinary account.');
  const product=await Product.create({ owner:req.user.id,name,category,description,monthlyRent,deposit,image,imagePublicId });
  res.status(201).json({ product });
});
app.patch('/api/admin/products/:id',auth,adminOnly,async (req,res) => {
  if (!validId(req.params.id)) return fail(res,400,'Invalid product ID.');
  const body=req.body||{},allowed=new Set(['available','active']);
  if (!Object.keys(body).length || Object.keys(body).some((key)=>!allowed.has(key)) || Object.values(body).some((value)=>typeof value!=='boolean')) return fail(res,400,'Only availability and listing status can be changed here.');
  if (body.available===true && await Rental.exists({ product:req.params.id,owner:req.user.id,status:{ $in:['pending','active','maintenance','return_requested'] } })) return fail(res,409,'This item is attached to an open rental.');
  const product=await Product.findOneAndUpdate({ _id:req.params.id,owner:req.user.id },{ $set:body },{ new:true,runValidators:true });
  if (!product) return fail(res,404,'Product not found.');
  res.json({ product });
});
app.put('/api/admin/products/:id',auth,adminOnly,async (req,res) => {
  if (!validId(req.params.id)) return fail(res,400,'Invalid product ID.');
  const name=cleanText(req.body?.name,100),category=req.body?.category,description=cleanText(req.body?.description??'',1000),monthlyRent=parseMoney(req.body?.monthlyRent),deposit=req.body?.deposit===undefined||req.body?.deposit===''?0:parseMoney(req.body.deposit);
  if (!name || !['Furniture','Appliances'].includes(category) || description===null || monthlyRent===null || monthlyRent<=0 || monthlyRent>10_000_000 || deposit===null || deposit<0 || deposit>10_000_000) return fail(res,400,'Check the product name, category, description, monthly rent, and deposit.');
  const product=await Product.findOneAndUpdate({ _id:req.params.id,owner:req.user.id },{ $set:{ name,category,description,monthlyRent,deposit } },{ new:true,runValidators:true });
  if (!product) return fail(res,404,'Product not found.');
  res.json({ product });
});
app.delete('/api/admin/products/:id',auth,adminOnly,async (req,res) => {
  if (!validId(req.params.id)) return fail(res,400,'Invalid product ID.');
  const product=await Product.findOne({ _id:req.params.id,owner:req.user.id }).select('_id').lean();
  if (!product) return fail(res,404,'Product not found.');
  if (await Rental.exists({ product:product._id,owner:req.user.id,status:{ $in:['pending','active','maintenance','return_requested'] } })) return fail(res,409,'This item is attached to an open rental and cannot be deleted yet.');
  await Product.deleteOne({ _id:product._id,owner:req.user.id });
  res.json({ deleted:true });
});
app.get('/api/admin/rentals',auth,adminOnly,async (req,res) => {
  const rentals=await Rental.find({ owner:req.user.id }).populate('customer','name email phone').sort({ createdAt:-1 }).limit(200);
  res.json(rentals.map(rentalView));
});
app.patch('/api/admin/rentals/:id',auth,adminOnly,async (req,res) => {
  if (!validId(req.params.id)) return fail(res,400,'Invalid rental ID.');
  const { status,trackingNote }=req.body||{};
  if (!['active','maintenance','return_requested','returned'].includes(status) || (trackingNote!==undefined && typeof trackingNote!=='string')) return fail(res,400,'Choose a valid status and tracking note.');
  const rental=await Rental.findOne({ _id:req.params.id,owner:req.user.id });
  if (!rental) return fail(res,404,'Rental not found.');
  const reopening=rental.status==='returned' && ['active','maintenance'].includes(status);
  const closing=status==='returned' && rental.status!=='returned';
  let reservedProduct=null;
  if (reopening) {
    reservedProduct=await Product.findOneAndUpdate({ _id:rental.product,owner:req.user.id,available:true },{ $set:{ available:false } },{ new:true });
    if (!reservedProduct) return fail(res,409,'This item is no longer available, so the rental cannot be reopened.');
    rental.approvedAt=new Date();
    rental.returnedAt=null;
  } else if (status==='active' && rental.status==='pending') rental.approvedAt=new Date();
  if (closing) rental.returnedAt=new Date();
  rental.status=status;
  if (trackingNote!==undefined) rental.trackingNote=cleanText(trackingNote,500)||'';
  try { await rental.save(); }
  catch (error) { if (reservedProduct) await Product.findOneAndUpdate({ _id:reservedProduct._id,owner:req.user.id },{ $set:{ available:true } }); throw error; }
  if (closing) await Product.findOneAndUpdate({ _id:rental.product,owner:req.user.id },{ $set:{ available:true } });
  res.json({ rental:rentalView(rental) });
});
app.delete('/api/admin/rentals/:id',auth,adminOnly,async (req,res) => {
  if (!validId(req.params.id)) return fail(res,400,'Invalid rental ID.');
  const deleted=await Rental.findOneAndDelete({ _id:req.params.id,owner:req.user.id });
  if (!deleted) return fail(res,404,'Rental order not found.');
  if (deleted.status!=='returned') await Product.findOneAndUpdate({ _id:deleted.product,owner:req.user.id },{ $set:{ available:true } });
  res.json({ deleted:true });
});
app.get('/api/admin/summary',auth,adminOnly,async (req,res) => {
  const [total,active,pending,returned,products,customers]=await Promise.all([
    Rental.countDocuments({ owner:req.user.id }),Rental.countDocuments({ owner:req.user.id,status:{ $in:['active','maintenance','return_requested'] } }),Rental.countDocuments({ owner:req.user.id,status:'pending' }),Rental.countDocuments({ owner:req.user.id,status:'returned' }),Product.countDocuments({ owner:req.user.id,active:true }),Rental.distinct('customer',{ owner:req.user.id })
  ]);
  res.json({ total,active,pending,returned,products,customers:customers.length });
});
app.post('/api/developer/admins',auth,developerOnly,async (req,res) => {
  const name=cleanText(req.body?.name,80),email=typeof req.body?.email==='string'?req.body.email.trim().toLowerCase():'',password=req.body?.password;
  if (!name || name.length<2 || !validEmail(email) || typeof password!=='string' || password.length<8 || Buffer.byteLength(password,'utf8')>72) return fail(res,400,'Enter a valid name, email, and password (8–72 bytes).');
  if (await User.exists({ email })) return fail(res,409,'An account with this email already exists.');
  const user=await User.create({ name,email,passwordHash:await bcrypt.hash(password,12),role:'admin' });
  res.status(201).json({ admin:{ id:user.id,name:user.name,email:user.email } });
});
app.delete('/api/developer/admins/:id',auth,developerOnly,async (req,res) => {
  if (!validId(req.params.id)) return fail(res,400,'Invalid admin ID.');
  const admin=await User.findOne({ _id:req.params.id,role:'admin' }).select('_id').lean();
  if (!admin) return fail(res,404,'Admin account not found.');
  if (await Rental.exists({ owner:admin._id,status:{ $in:['pending','active','maintenance','return_requested'] } })) return fail(res,409,'This admin has open rental records. Close those rentals before deleting the account.');
  await Product.deleteMany({ owner:admin._id });
  const deleted=await User.findOneAndDelete({ _id:admin._id,role:'admin' });
  if (!deleted) return fail(res,404,'Admin account not found.');
  res.json({ deleted:true });
});
app.get('/api/developer/stats',auth,developerOnly,async (_req,res) => {
  const [customers,adminCount,admins,customerGroups,productCounts]=await Promise.all([
    User.countDocuments({ role:'customer' }),User.countDocuments({ role:'admin' }),User.find({ role:'admin' }).select('name email storeName storeCity').sort({ createdAt:-1 }).limit(250).lean(),
    Rental.aggregate([{ $group:{ _id:{ owner:'$owner',customer:'$customer' } } },{ $group:{ _id:'$_id.owner',count:{ $sum:1 } } }]),
    Product.aggregate([{ $match:{ active:true } },{ $group:{ _id:'$owner',count:{ $sum:1 } } }])
  ]);
  const customerMap=new Map(customerGroups.map((x)=>[String(x._id),x.count])),productMap=new Map(productCounts.map((x)=>[String(x._id),x.count]));
  res.json({ customers,admins:adminCount,stores:admins.map((a)=>({ id:String(a._id),name:a.name,email:a.email,storeName:a.storeName,storeCity:a.storeCity,customers:customerMap.get(String(a._id))||0,products:productMap.get(String(a._id))||0 })) });
});

app.use('/api',(_req,res)=>fail(res,404,'API endpoint not found.'));
app.use((err,_req,res,_next) => {
  console.error('Request failed:',err.message);
  if (err instanceof multer.MulterError) return fail(res,400,'Image upload was rejected. Choose one image under 5 MB.');
  if (err.message==='Unsupported image type') return fail(res,400,'Use a JPEG, PNG, WebP, or AVIF image.');
  const status=Number.isInteger(err.status)&&err.status>=400&&err.status<500?err.status:500;
  const message=status===413?'Request is too large.':status===400?'Invalid request.':'Something went wrong. Please try again.';
  res.status(status).json({ error:message });
});

async function start() {
  if (!process.env.MONGODB_URI || !process.env.JWT_SECRET) throw new Error('MONGODB_URI and JWT_SECRET must be configured.');
  await mongoose.connect(process.env.MONGODB_URI);
  if (process.env.DEVELOPER_EMAIL && process.env.DEVELOPER_PASSWORD) {
    const email=process.env.DEVELOPER_EMAIL.trim().toLowerCase(),password=process.env.DEVELOPER_PASSWORD;
    if (Buffer.byteLength(password,'utf8')<8 || Buffer.byteLength(password,'utf8')>72) throw new Error('DEVELOPER_PASSWORD must be between 8 and 72 bytes.');
    await User.findOneAndUpdate({ email },{ $set:{ name:'RentEase Developer',email,passwordHash:await bcrypt.hash(password,12),role:'developer' } },{ upsert:true,new:true,setDefaultsOnInsert:true });
  }
  // Keep support for an explicitly configured initial admin account during migration.
  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    const email=process.env.ADMIN_EMAIL.trim().toLowerCase(),password=process.env.ADMIN_PASSWORD;
    await User.findOneAndUpdate({ email },{ $set:{ name:'RentEase Admin',email,passwordHash:await bcrypt.hash(password,12),role:'admin' } },{ upsert:true,new:true,setDefaultsOnInsert:true });
  }
  app.listen(port,()=>console.log('MongoDB connected successfully.'));
}
start().catch((error)=>{ console.error('Startup failed:',error.message);process.exit(1); });






