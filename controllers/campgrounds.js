const Campground = require('../models/campground');
const mbxGeocoding = require("@mapbox/mapbox-sdk/services/geocoding");
const mapBoxToken = process.env.MAPBOX_TOKEN;
const geocoder = mbxGeocoding({ accessToken: mapBoxToken });
const { cloudinary } = require("../cloudinary");
const ExpressError = require('../utils/ExpressError');


module.exports.index = async (req, res) => {
    const campgrounds = await Campground.find({}).populate('popupText');
    res.render('campgrounds/index', { campgrounds })
}

module.exports.renderNewForm = (req, res) => {
    res.render('campgrounds/new');
}

module.exports.createCampground = async (req, res, next) => {
    try {
        console.log('Request body:', req.body);
        console.log('Request files:', req.files);

        const geoData = await geocoder.forwardGeocode({
            query: req.body.campground.location,
            limit: 1
        }).send();
        if (!geoData) {
            throw new ExpressError("Not found any location match your input, retry!", 422);
        }
        const campground = new Campground(req.body.campground);
        campground.geometry = geoData.body.features[0].geometry;
        if (req.files.image) {
            campground.images = req.files.image.map(f => ({ url: f.path, filename: f.filename }));
        }
        campground.author = req.user._id;
        if (req.files.qrcode && req.files.qrcode[0]) {
            campground.qrcode = { url: req.files.qrcode[0].path, filename: req.files.qrcode[0].filename };
        }
        await campground.save();
        console.log(campground);
        req.flash('success', 'Successfully made a new campground!');
        res.redirect(`/campgrounds/${campground._id}`);
    } catch (error) {
        console.error('Error creating campground:', error);
        next(error);
    }
}

module.exports.showCampground = async (req, res) => {
    const campground = await Campground.findById(req.params.id).populate('reviews').populate('author');
    if (!campground) {
        req.flash('error', 'Cannot find that campground!');
        return res.redirect('/campgrounds');
    }
    res.render('campgrounds/show', { campground });
};

module.exports.renderEditForm = async (req, res) => {
    const { id } = req.params;
    const campground = await Campground.findById(id)
    if (!campground) {
        req.flash('error', 'Cannot find that campground!');
        return res.redirect('/campgrounds');
    }
    res.render('campgrounds/edit', { campground });
}

module.exports.updateCampground = async (req, res) => {
    const { id } = req.params;
    console.log(req.body);
    const campground = await Campground.findByIdAndUpdate(id, { ...req.body.campground });
    const imgs = req.files.map(f => ({ url: f.path, filename: f.filename })); // req.files is created for us by multer
    campground.images.push(...imgs);
    await campground.save();
    if (req.body.deleteImages) {
        for (let filename of req.body.deleteImages) {
            await cloudinary.uploader.destroy(filename);
        }
        await campground.updateOne({ $pull: { images: { filename: { $in: req.body.deleteImages } } } })
    }
    req.flash('success', 'Successfully updated campground!');
    res.redirect(`/campgrounds/${campground._id}`)
}

module.exports.deleteCampground = async (req, res) => {
    const { id } = req.params;
    await Campground.findByIdAndDelete(id);
    req.flash('success', 'Successfully deleted campground')
    res.redirect('/campgrounds');
}