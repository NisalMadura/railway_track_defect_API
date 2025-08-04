// server.js - Express MongoDB API for Railway Inspector App
// SECURE VERSION - Environment variables used instead of hardcoded credentials

require('dotenv').config(); // Load environment variables

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// SECURE: Configure Cloudinary with environment variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configure Multer for file uploads
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'cgr_track_inspector',
    allowedFormats: ['jpg', 'jpeg', 'png'],
    transformation: [{ width: 1000, crop: "limit" }],
  },
});

const upload = multer({ storage: storage });

// SECURE: MongoDB Connection with environment variable
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('MongoDB Connected'))
.catch(err => console.log('MongoDB Connection Error:', err));

// Define User Schema
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  role: { type: String, enum: ['admin', 'maintenance', 'engineer', 'team', 'inspector'], required: true },
  department: { type: String },
  expertise: [String],
  phoneNumber: { type: String },
  avatar: { type: String },
  isActive: { type: Boolean, default: true },
  lastActive: { type: Date },
  password: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

// Define Report Schema
const reportSchema = new mongoose.Schema({
  defectType: {
    type: String,
    required: true
  },
  location: {
    type: String,
    required: true
  },
  reportDate: {
    type: Date,
    default: Date.now
  },
  riskLevel: {
    type: String,
    enum: ['Low', 'Medium', 'High'],
    required: true
  },
  description: String,
  imageUrl: String,
  status: {
    type: String,
    enum: ['Pending', 'Assigned', 'In Progress', 'Resolved', 'Closed'],
    default: 'Pending'
  },
  assignedTo: String,
  reportedBy: String,
  dueDate: {
    type: Date
  },
  comments: [{
    text: String,
    author: String,
    timestamp: {
      type: Date,
      default: Date.now
    }
  }]
});

const User = mongoose.model('User', userSchema);
const Report = mongoose.model('Report', reportSchema);

// Routes

// Get users with maintenance role only
app.get('/api/users/maintenance', async (req, res) => {
  try {
    const maintenanceUsers = await User.find({
      role: 'engineer'
    }).select('-password'); // Exclude password for security
    
    res.json(maintenanceUsers);
  } catch (err) {
    console.error('Error fetching maintenance users:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get recent reports (default sorted by date)
app.get('/api/reports', async (req, res) => {
  try {
    const reports = await Report.find()
      .sort('-reportDate');
      
    res.json(reports);
  } catch (err) {
    console.error('Error fetching reports:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get defects endpoint (aliased to reports for mobile app)
app.get('/api/defects', async (req, res) => {
  try {
    const reports = await Report.find()
      .sort('-reportDate');
      
    res.json(reports);
  } catch (err) {
    console.error('Error fetching defects:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get dashboard statistics
app.get('/api/reports/stats', async (req, res) => {
  try {
    const pendingCount = await Report.countDocuments({ status: { $ne: 'Resolved' } });
    const resolvedCount = await Report.countDocuments({ status: 'Resolved' });
    const highRiskCount = await Report.countDocuments({ riskLevel: 'High' });
    
    res.json({
      pending: pendingCount,
      resolved: resolvedCount,
      highRisk: highRiskCount
    });
  } catch (err) {
    console.error('Error fetching stats:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

app.get('/api/reports/stats/pie', async (req, res) => {
  try {
    const pendingCount = await Report.countDocuments({ status: 'Pending' } );
    const resolvedCount = await Report.countDocuments({ status: 'Resolved' });
    const inprogressCount = await Report.countDocuments({ status: 'In Progress' });
    
    res.json({
      pending: pendingCount,
      resolved: resolvedCount,
      inprogress: inprogressCount
    });
  } catch (err) {
    console.error('Error fetching stats:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get report by ID
app.get('/api/reports/:id', async (req, res) => {
  try {
    const report = await Report.findById(req.params.id);
    
    if (!report) {
      return res.status(404).json({ message: 'Report not found' });
    }
    
    res.json(report);
  } catch (err) {
    console.error('Error fetching report:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get defect by ID endpoint for mobile app
app.get('/api/defects/:id', async (req, res) => {
  try {
    const report = await Report.findById(req.params.id);
    
    if (!report) {
      return res.status(404).json({ message: 'Defect not found' });
    }
    
    res.json(report);
  } catch (err) {
    console.error('Error fetching defect:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Upload image directly to Cloudinary
app.post('/api/upload', upload.single('image'), (req, res) => {
  try {
    res.json({ imageUrl: req.file.path });
  } catch (err) {
    console.error('Error uploading image:', err);
    res.status(500).json({ message: 'Image upload failed' });
  }
});

// Upload base64 image to Cloudinary
app.post('/api/upload/base64', async (req, res) => {
  try {
    const { image } = req.body;
    
    if (!image) {
      return res.status(400).json({ message: 'No image provided' });
    }
    
    const uploadResult = await cloudinary.uploader.upload(image, {
      folder: 'cgr_track_inspector',
    });
    
    res.json({ imageUrl: uploadResult.secure_url });
  } catch (err) {
    console.error('Error uploading base64 image:', err);
    res.status(500).json({ message: 'Image upload failed' });
  }
});

// Create new report
app.post('/api/reports', async (req, res) => {
  try {
    const newReport = new Report(req.body);
    const savedReport = await newReport.save();
    res.status(201).json(savedReport);
  } catch (err) {
    console.error('Error creating report:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create new defect endpoint for mobile app
app.post('/api/defects', async (req, res) => {
  try {
    const newReport = new Report(req.body);
    const savedReport = await newReport.save();
    res.status(201).json(savedReport);
  } catch (err) {
    console.error('Error creating defect:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update report
app.put('/api/reports/:id', async (req, res) => {
  try {
    const updatedReport = await Report.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    
    if (!updatedReport) {
      return res.status(404).json({ message: 'Report not found' });
    }
    
    res.json(updatedReport);
  } catch (err) {
    console.error('Error updating report:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update defect status for mobile app
app.put('/api/defects/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    
    const updatedReport = await Report.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );
    
    if (!updatedReport) {
      return res.status(404).json({ message: 'Defect not found' });
    }
    
    res.json(updatedReport);
  } catch (err) {
    console.error('Error updating defect status:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Add comment to defect for mobile app
app.post('/api/defects/:id/comments', async (req, res) => {
  try {
    const report = await Report.findById(req.params.id);
    
    if (!report) {
      return res.status(404).json({ message: 'Defect not found' });
    }
    
    // Add the new comment
    report.comments.push(req.body);
    
    // Save the updated report
    const updatedReport = await report.save();
    
    res.json(updatedReport);
  } catch (err) {
    console.error('Error adding comment to defect:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete report
app.delete('/api/reports/:id', async (req, res) => {
  try {
    const report = await Report.findByIdAndDelete(req.params.id);
    
    if (!report) {
      return res.status(404).json({ message: 'Report not found' });
    }
    
    // Delete the image from Cloudinary if exists
    if (report.imageUrl) {
      const publicId = report.imageUrl.split('/').pop().split('.')[0];
      await cloudinary.uploader.destroy(`cgr_track_inspector/${publicId}`);
    }
    
    res.json({ message: 'Report deleted successfully' });
  } catch (err) {
    console.error('Error deleting report:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete defect endpoint for mobile app
app.delete('/api/defects/:id', async (req, res) => {
  try {
    const report = await Report.findByIdAndDelete(req.params.id);
    
    if (!report) {
      return res.status(404).json({ message: 'Defect not found' });
    }
    
    // Delete the image from Cloudinary if exists
    if (report.imageUrl) {
      const publicId = report.imageUrl.split('/').pop().split('.')[0];
      await cloudinary.uploader.destroy(`cgr_track_inspector/${publicId}`);
    }
    
    res.json({ message: 'Defect deleted successfully' });
  } catch (err) {
    console.error('Error deleting defect:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all users
app.get('/api/users', async (req, res) => {
  try {
    const users = await User.find().select('-password'); // Exclude password for security
    res.json(users);
  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create new user
app.post('/api/users', async (req, res) => {
  try {
    // Check if user with this email already exists
    const existingUser = await User.findOne({ email: req.body.email });
    if (existingUser) {
      return res.status(400).json({ message: 'User with this email already exists' });
    }

    // Create new user
    const newUser = new User(req.body);
    
    // In production, you should hash the password before saving
    // For example: newUser.password = await bcrypt.hash(req.body.password, 10);
    
    const savedUser = await newUser.save();
    
    // Don't return password in response
    const userResponse = savedUser.toObject();
    delete userResponse.password;
    
    res.status(201).json(userResponse);
  } catch (err) {
    console.error('Error creating user:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update user status (activate/deactivate)
app.put('/api/users/:id/status', async (req, res) => {
  try {
    const { isActive } = req.body;
    
    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      { isActive, lastActive: isActive ? new Date() : undefined },
      { new: true }
    ).select('-password');
    
    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json(updatedUser);
  } catch (err) {
    console.error('Error updating user status:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete user
app.delete('/api/users/:id', async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    console.error('Error deleting user:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update user (for editing user details)
app.put('/api/users/:id', async (req, res) => {
  try {
    // Don't allow updating email to one that already exists
    if (req.body.email) {
      const existingUser = await User.findOne({ 
        email: req.body.email,
        _id: { $ne: req.params.id } // Exclude the current user
      });
      
      if (existingUser) {
        return res.status(400).json({ message: 'Email already in use' });
      }
    }
    
    // For security, don't allow password updates through this endpoint
    if (req.body.password) {
      delete req.body.password;
    }
    
    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    ).select('-password');
    
    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json(updatedUser);
  } catch (err) {
    console.error('Error updating user:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Generate some sample data for testing
app.post('/api/seed', async (req, res) => {
  try {
    // Clear existing data
    await Report.deleteMany({});
    
    // Create sample reports
    const sampleReports = [
      {
        defectType: 'Rail Crack',
        location: 'Sector A-12',
        reportDate: new Date('2025-03-12'),
        riskLevel: 'High',
        description: 'Severe lateral crack observed in rail joint',
        status: 'Pending',
        reportedBy: 'Track Inspector'
      },
      {
        defectType: 'Loose Fastener',
        location: 'Junction B-5',
        reportDate: new Date('2025-03-10'),
        riskLevel: 'Medium',
        description: 'Multiple loose fasteners detected in curve section',
        status: 'In Progress',
        reportedBy: 'Track Inspector'
      },
      {
        defectType: 'Surface Wear',
        location: 'Section C-8',
        reportDate: new Date('2025-03-08'),
        riskLevel: 'Low',
        description: 'Minor surface wear observed over 2m section',
        status: 'Pending',
        reportedBy: 'Track Inspector'
      },
      {
        defectType: 'Ballast Contamination',
        location: 'Track D-3',
        reportDate: new Date('2025-03-05'),
        riskLevel: 'Medium',
        description: 'Mud pumping observed in ballast bed',
        status: 'Resolved',
        reportedBy: 'Track Inspector'
      },
      {
        defectType: 'Broken Sleeper',
        location: 'Station Approach E-1',
        reportDate: new Date('2025-03-01'),
        riskLevel: 'High',
        description: 'Concrete sleeper cracked at center',
        status: 'In Progress',
        reportedBy: 'Track Inspector'
      }
    ];
    
    await Report.insertMany(sampleReports);
    
    // Create sample users with maintenance roles if they don't exist
    const existingUsers = await User.countDocuments();
    
    if (existingUsers === 0) {
      const sampleUsers = [
        {
          name: 'John Maintenance',
          email: 'john@cgr.com',
          role: 'maintenance',
          password: 'password123' // In production, this should be hashed
        },
        {
          name: 'Sarah Engineer',
          email: 'sarah@cgr.com',
          role: 'engineer',
          password: 'password123'
        },
        {
          name: 'Mike Team',
          email: 'mike@cgr.com',
          role: 'team',
          password: 'password123'
        }
      ];
      
      await User.insertMany(sampleUsers);
    }
    
    res.json({ message: 'Sample data created successfully' });
  } catch (err) {
    console.error('Error seeding data:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});