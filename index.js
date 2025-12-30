require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

const dbUri = process.env.MONGO_URI || 'mongodb+srv://moath:moath85@cluster0.1uqgesm.mongodb.net/moath_bank_db?retryWrites=true&w=majority';

mongoose.connect(dbUri)
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('Could not connect to MongoDB', err));

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    balance: { type: Number, default: 0.00 }
});

const notificationSchema = new mongoose.Schema({
    userEmail: { type: String, required: true }, 
    message: { type: String, required: true },
    date: { type: Date, default: Date.now },
    isRead: {type: Boolean, default:false}
});

const transactionSchema = new mongoose.Schema({
    email: { type: String, required: true }, 
    type: { type: String, required: true },
    amount: { type: Number, required: true },
    description: { type: String }, 
    date: { type: Date, default: Date.now }
});

const Transaction = mongoose.model('Transaction', transactionSchema);
const Notification = mongoose.model('Notification', notificationSchema);
const User = mongoose.model('User', userSchema);


app.get('/', (req, res) => {
    res.send('Banking App Backend is Running!');
});

app.post('/api/signup', async (req, res) => {
    const { name, email, password } = req.body;
    try {
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ success: false, message: "Email already in use" });
        }
        const newUser = new User({ name, email, password, balance: 1000.00 });
        await newUser.save();
        res.status(201).json({ success: true, message: "User created successfully" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error creating user" });
    }
});

app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await User.findOne({ email, password });
        if (user) {
            res.status(200).json({
                success: true,
                message: "Login successful",
                user: {
                    name: user.name,
                    email: user.email,
                    balance: user.balance
                }
            });
        } else {
            res.status(401).json({ success: false, message: "Invalid email or password" });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: "Server error" });
    }
});

app.post('/api/transfer', async (req, res) => {
    const { senderEmail, recipientEmail, amount } = req.body; 
    const transferAmount = parseFloat(amount);

    if (isNaN(transferAmount) || transferAmount <= 0) {
        return res.status(400).json({ success: false, message: "Invalid amount" });
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const sender = await User.findOne({ email: senderEmail }).session(session);
        const recipient = await User.findOne({ email: recipientEmail }).session(session);
        
        if (!sender) throw new Error("Sender not found");
        if (!recipient) throw new Error("Recipient not found");
        if (sender.balance < transferAmount) throw new Error("Insufficient funds");
        sender.balance -= transferAmount;
        recipient.balance += transferAmount;
        const newNotification = new Notification({
            userEmail: recipientEmail,
            message: `You received $${transferAmount} from ${sender.name}`,
            isRead: false
        });

        const senderTx = new Transaction({
            email: senderEmail,
            type: 'Transfer',
            amount: -transferAmount,
            description: `Transfer to ${recipient.name}`
        });

        const recipientTx = new Transaction({
            email: recipientEmail,
            type: 'Transfer',
            amount: transferAmount,
            description: `Received from ${sender.name}`
        });

        await sender.save();
        await recipient.save();
        await newNotification.save(); 
        await senderTx.save();    
        await recipientTx.save();

        await session.commitTransaction();
        
        res.json({
            success: true,
            message: "Transfer successful",
            newBalance: sender.balance
        });

    } catch (error) {
        await session.abortTransaction();
        res.status(400).json({ success: false, message: error.message });
    } finally {
        session.endSession();
    }
});

app.post('/api/user', async (req, res) => {
    const { email } = req.body;
    try {
        const user = await User.findOne({ email });
        if (user) {
            res.json({
                success: true,
                user: {
                    name: user.name,
                    email: user.email,
                    balance: user.balance
                }
            });
        } else {
            res.status(404).json({ success: false, message: "User not found" });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: "Server error" });
    }
});

app.post('/api/notifications', async (req, res) => {
    const { email } = req.body;
    try {
        const notifications = await Notification.find({ userEmail: email }).sort({ date: -1 });
        res.json({ success: true, notifications });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error fetching notifications" });
    }
});

app.post('/api/notifications/read', async (req, res) => {
    const { notificationId } = req.body;
    try {
        await Notification.findByIdAndUpdate(notificationId, { isRead: true });
        res.json({ success: true, message: "Notification marked as read" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error updating notification" });
    }
});

app.post('/api/paybill', async (req, res) => {
    const { email, biller, amount } = req.body;
    const billAmount = parseFloat(amount);

    if (isNaN(billAmount) || billAmount <= 0) {
        return res.status(400).json({ success: false, message: "Invalid amount" });
    }
    try {
        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ success: false, message: "User not found" });
        if (user.balance < billAmount) return res.status(400).json({ success: false, message: "Insufficient funds" });
        
        user.balance -= billAmount;
        await user.save();      
        
        const billTx = new Transaction({
            email: email,
            type: 'Bill Payment',
            amount: -billAmount,
            description: `Paid to ${biller}`
        });
        await billTx.save();
        
        res.json({
            success: true,
            message: `Paid $${billAmount} to ${biller}`,
            newBalance: user.balance
        });
    } catch (error) {
        res.status(500).json({ success: false, message: "Transaction failed" });
    }
});

app.post('/api/transactions', async (req, res) => {
    const { email } = req.body;
    try {
        const transactions = await Transaction.find({ email }).sort({ date: -1 });
        res.json({ success: true, transactions });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error fetching history" });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
