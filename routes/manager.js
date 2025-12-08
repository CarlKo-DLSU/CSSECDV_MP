const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const Profile = require('../database/models/Profile');
const Review = require('../database/models/Review');
const Resto = require('../database/models/Resto');
const { requireRole, requireAnyRole } = require('../utility/require_role');

// All manager routes require manager or admin role
router.use(requireAnyRole(['manager', 'admin']));

// Validation helpers
function isValidUsername(u) {
    if (typeof u !== 'string') return false;
    if (/[\x00-\x1F\x7F\\\$\[\]]/.test(u)) return false;
    const s = u.trim();
    return s.length >= 1 && s.length <= 30;
}

function isValidPassword(p) {
    if (typeof p !== 'string') return false;
    if (p.length < 8 || p.length > 128) return false;
    if (/[\x00-\x1F\x7F\\\$\[\]]/.test(p)) return false;
    return true;
}

// POST /manager/create-reviewer - Create new business owner account (manager/admin only)
router.post('/create-reviewer', async (req, res) => {
    try {
        const { username, password } = req.body;

        // Validate inputs
        if (!username || !password) {
            console.log(`[MANAGER] CREATE-REVIEWER FAIL - Manager: ${req.user.name}, Reason: Missing required fields`);
            return res.redirect('/error?errorMsg=' + encodeURIComponent('Missing required fields.'));
        }

        if (!isValidUsername(username)) {
            console.log(`[MANAGER] CREATE-REVIEWER FAIL - Manager: ${req.user.name}, Username: ${username}, Reason: Invalid username format`);
            return res.redirect('/error?errorMsg=' + encodeURIComponent('Invalid username format.'));
        }

        if (!isValidPassword(password)) {
            console.log(`[MANAGER] CREATE-REVIEWER FAIL - Manager: ${req.user.name}, Username: ${username}, Reason: Invalid password format`);
            return res.redirect('/error?errorMsg=' + encodeURIComponent('Password must be 8-128 characters with no invalid characters.'));
        }

        // Check if username already exists
        const existing = await Profile.findOne({ name: username.trim() });
        if (existing) {
            console.log(`[MANAGER] CREATE-REVIEWER FAIL - Manager: ${req.user.name}, Username: ${username}, Reason: Username already exists`);
            return res.redirect('/error?errorMsg=' + encodeURIComponent('Username already exists.'));
        }

        // Hash password and create business owner account (role: 'reviewer')
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new Profile({
            name: username.trim(),
            password: hashedPassword,
            role: 'reviewer'
        });
        await newUser.save();

        console.log(`[MANAGER] CREATE-REVIEWER SUCCESS - Manager: ${req.user.name}, Created business owner account for ${username}`);
        return res.redirect(`/profile/id/${req.user.name}?success=Business owner account created successfully`);
    } catch (err) {
        console.error(`[MANAGER] CREATE-REVIEWER ERROR - Manager: ${req.user.name}, Error: ${err.message}`);
        return res.redirect('/error?errorMsg=' + encodeURIComponent('Failed to create business owner account.'));
    }
});

// POST /manager/assign-reviewer-role - Edit user (manager can only manage regular users)
router.post('/assign-reviewer-role', async (req, res) => {
    try {
        const { username, description } = req.body;

        if (!username) {
            console.log(`[MANAGER] EDIT-USER FAIL - Manager: ${req.user.name}, Reason: Missing username`);
            return res.redirect('/error?errorMsg=' + encodeURIComponent('Missing username.'));
        }

        // Find user
        const user = await Profile.findOne({ name: username });
        if (!user) {
            console.log(`[MANAGER] EDIT-USER FAIL - Manager: ${req.user.name}, Username: ${username}, Reason: User not found`);
            return res.redirect('/error?errorMsg=' + encodeURIComponent('User not found.'));
        }

        // Manager cannot edit managers or admins
        if (req.user.role === 'manager' && (user.role === 'manager' || user.role === 'admin')) {
            console.log(`[MANAGER] EDIT-USER FAIL - Manager: ${req.user.name}, Username: ${username}, Reason: Can only edit business owners`);
            return res.redirect('/error?errorMsg=' + encodeURIComponent('You can only manage regular user accounts.'));
        }

        // Update description if provided
        if (description) {
            user.description = description.trim();
            await user.save();
            console.log(`[MANAGER] EDIT-USER SUCCESS - Manager: ${req.user.name}, Edited description for ${username}`);
        }

        return res.redirect(`/profile/id/${req.user.name}?success=User updated successfully`);
    } catch (err) {
        console.error(`[MANAGER] EDIT-USER ERROR - Manager: ${req.user.name}, Error: ${err.message}`);
        return res.redirect('/error?errorMsg=' + encodeURIComponent('Failed to update user.'));
    }
});

// POST /manager/delete-reviewer - Delete business owner account (manager/admin only)
router.post('/delete-reviewer', async (req, res) => {
    try {
        const { username } = req.body;

        if (!username) {
            console.log(`[MANAGER] DELETE-USER FAIL - Manager: ${req.user.name}, Reason: Missing username`);
            return res.redirect('/error?errorMsg=' + encodeURIComponent('Missing username.'));
        }

        // Find user
        const user = await Profile.findOne({ name: username });
        if (!user) {
            console.log(`[MANAGER] DELETE-USER FAIL - Manager: ${req.user.name}, Username: ${username}, Reason: User not found`);
            return res.redirect('/error?errorMsg=' + encodeURIComponent('User not found.'));
        }

        // Managers cannot delete managers or admins
        if (req.user.role === 'manager' && (user.role === 'manager' || user.role === 'admin')) {
            console.log(`[MANAGER] DELETE-USER FAIL - Manager: ${req.user.name}, Username: ${username}, Reason: Can only delete business owners`);
            return res.redirect('/error?errorMsg=' + encodeURIComponent('You can only delete business owner accounts.'));
        }

        // Prevent self-deletion
        if (user._id.equals(req.user._id)) {
            console.log(`[MANAGER] DELETE-USER FAIL - Manager: ${req.user.name}, Username: ${username}, Reason: Attempted self-deletion`);
            return res.redirect('/error?errorMsg=' + encodeURIComponent('Cannot delete your own account.'));
        }

        // Delete business owner's reviews
        await Review.deleteMany({ profileId: user._id });

        // Delete business owner account
        await Profile.deleteOne({ _id: user._id });

        console.log(`[MANAGER] DELETE-USER SUCCESS - Manager: ${req.user.name}, Deleted business owner ${username}`);
        return res.redirect(`/profile/id/${req.user.name}?success=Business owner deleted successfully`);
    } catch (err) {
        console.error(`[MANAGER] DELETE-USER ERROR - Manager: ${req.user.name}, Error: ${err.message}`);
        return res.redirect('/error?errorMsg=' + encodeURIComponent('Failed to delete business owner.'));
    }
});

// GET /manager/reviewers - List all business owners (manager/admin can view)
router.get('/reviewers', async (req, res) => {
    try {
        const businessOwners = await Profile.find({ role: 'reviewer' }).select('name avatar createdAt role');
        res.json(businessOwners);
    } catch (err) {
        console.error('Manager get business owners error:', err);
        res.status(500).json({ error: 'Failed to retrieve business owners' });
    }
});

// POST /manager/edit-user-description - Edit business owner's description (manager/admin only)
router.post('/edit-user-description', async (req, res) => {
    try {
        const { username, description } = req.body;

        if (!username || description === undefined) {
            console.log(`[MANAGER] EDIT-DESCRIPTION FAIL - Manager: ${req.user.name}, Reason: Missing username or description`);
            return res.redirect('/error?errorMsg=' + encodeURIComponent('Missing username or description.'));
        }

        // Find user
        const user = await Profile.findOne({ name: username });
        if (!user) {
            console.log(`[MANAGER] EDIT-DESCRIPTION FAIL - Manager: ${req.user.name}, Username: ${username}, Reason: User not found`);
            return res.redirect('/error?errorMsg=' + encodeURIComponent('User not found.'));
        }

        // Managers cannot edit managers or admins
        if (req.user.role === 'manager' && (user.role === 'manager' || user.role === 'admin')) {
            console.log(`[MANAGER] EDIT-DESCRIPTION FAIL - Manager: ${req.user.name}, Username: ${username}, Reason: Can only edit business owner descriptions`);
            return res.redirect('/error?errorMsg=' + encodeURIComponent('You can only edit business owner descriptions.'));
        }

        // Update description
        user.description = description.trim();
        await user.save();

        console.log(`[MANAGER] EDIT-DESCRIPTION SUCCESS - Manager: ${req.user.name}, Edited description for ${username}`);
        return res.redirect(`/profile/id/${req.user.name}?success=User description updated successfully`);
    } catch (err) {
        console.error(`[MANAGER] EDIT-DESCRIPTION ERROR - Manager: ${req.user.name}, Error: ${err.message}`);
        return res.redirect('/error?errorMsg=' + encodeURIComponent('Failed to edit user description.'));
    }
});

// POST /manager/assign-restaurant-owner - Assign restaurant to business owner
router.post('/assign-restaurant-owner', async (req, res) => {
    try {
        const { restaurantId, username } = req.body;

        if (!restaurantId || !username) {
            console.log(`[MANAGER] ASSIGN-RESTAURANT FAIL - Manager: ${req.user.name}, Reason: Missing restaurant or owner`);
            return res.redirect('/error?errorMsg=' + encodeURIComponent('Missing restaurant or owner.'));
        }

        // Find restaurant
        const resto = await Resto.findById(restaurantId);
        if (!resto) {
            console.log(`[MANAGER] ASSIGN-RESTAURANT FAIL - Manager: ${req.user.name}, RestaurantId: ${restaurantId}, Reason: Restaurant not found`);
            return res.redirect('/error?errorMsg=' + encodeURIComponent('Restaurant not found.'));
        }

        // Find user
        const user = await Profile.findOne({ name: username });
        if (!user) {
            console.log(`[MANAGER] ASSIGN-RESTAURANT FAIL - Manager: ${req.user.name}, Username: ${username}, Reason: User not found`);
            return res.redirect('/error?errorMsg=' + encodeURIComponent('User not found.'));
        }

        // Managers can only assign to business owners
        if (req.user.role === 'manager' && user.role !== 'reviewer') {
            console.log(`[MANAGER] ASSIGN-RESTAURANT FAIL - Manager: ${req.user.name}, Username: ${username}, Reason: Can only assign to business owners`);
            return res.redirect('/error?errorMsg=' + encodeURIComponent('Can only assign restaurants to business owners.'));
        }

        // Assign restaurant to user
        resto.owner = user._id;
        await resto.save();

        console.log(`[MANAGER] ASSIGN-RESTAURANT SUCCESS - Manager: ${req.user.name}, Assigned restaurant ${resto.name} to ${username}`);
        return res.redirect(`/profile/id/${req.user.name}?success=Restaurant owner assigned successfully`);
    } catch (err) {
        console.error(`[MANAGER] ASSIGN-RESTAURANT ERROR - Manager: ${req.user.name}, Error: ${err.message}`);
        return res.redirect('/error?errorMsg=' + encodeURIComponent('Failed to assign restaurant owner.'));
    }
});

// POST /manager/delete-review - Delete a review/comment
router.post('/delete-review', async (req, res) => {
    try {
        const { reviewId } = req.body;

        if (!reviewId) {
            console.log(`[MANAGER] DELETE-REVIEW FAIL - Manager: ${req.user.name}, Reason: Missing review ID`);
            return res.redirect('/error?errorMsg=' + encodeURIComponent('Missing review ID.'));
        }

        // Find review
        const review = await Review.findById(reviewId);
        if (!review) {
            console.log(`[MANAGER] DELETE-REVIEW FAIL - Manager: ${req.user.name}, ReviewId: ${reviewId}, Reason: Review not found`);
            return res.redirect('/error?errorMsg=' + encodeURIComponent('Review not found.'));
        }

        // Delete review
        await Review.deleteOne({ _id: reviewId });

        console.log(`[MANAGER] DELETE-REVIEW SUCCESS - Manager: ${req.user.name}, Deleted review ${reviewId}`);
        return res.redirect(`/profile/id/${req.user.name}?success=Review deleted successfully`);
    } catch (err) {
        console.error(`[MANAGER] DELETE-REVIEW ERROR - Manager: ${req.user.name}, Error: ${err.message}`);
        return res.redirect('/error?errorMsg=' + encodeURIComponent('Failed to delete review.'));
    }
});

// POST /manager/add-restaurant - Add new restaurant
router.post('/add-restaurant', async (req, res) => {
    try {
        const { name, description, owner } = req.body;

        if (!name || !owner) {
            console.log(`[MANAGER] ADD-RESTAURANT FAIL - Manager: ${req.user.name}, Reason: Missing restaurant name or owner`);
            return res.redirect('/error?errorMsg=' + encodeURIComponent('Missing restaurant name or owner.'));
        }

        // Find owner user
        const ownerUser = await Profile.findOne({ name: owner });
        if (!ownerUser) {
            console.log(`[MANAGER] ADD-RESTAURANT FAIL - Manager: ${req.user.name}, RestaurantName: ${name}, Owner: ${owner}, Reason: Owner not found`);
            return res.redirect('/error?errorMsg=' + encodeURIComponent('Owner not found.'));
        }

        // Create new restaurant
        const newResto = new Resto({
            name: name.trim(),
            description: description ? description.trim() : 'No description.',
            owner: ownerUser._id
        });
        await newResto.save();

        console.log(`[MANAGER] ADD-RESTAURANT SUCCESS - Manager: ${req.user.name}, Added restaurant ${name} (Owner: ${owner})`);
        return res.redirect(`/profile/id/${req.user.name}?success=Restaurant added successfully`);
    } catch (err) {
        console.error(`[MANAGER] ADD-RESTAURANT ERROR - Manager: ${req.user.name}, Error: ${err.message}`);
        return res.redirect('/error?errorMsg=' + encodeURIComponent('Failed to add restaurant.'));
    }
});

// POST /manager/delete-restaurant - Delete restaurant
router.post('/delete-restaurant', async (req, res) => {
    try {
        const { restaurantId } = req.body;

        if (!restaurantId) {
            console.log(`[MANAGER] DELETE-RESTAURANT FAIL - Manager: ${req.user.name}, Reason: Missing restaurant ID`);
            return res.redirect('/error?errorMsg=' + encodeURIComponent('Missing restaurant ID.'));
        }

        // Find restaurant
        const resto = await Resto.findById(restaurantId);
        if (!resto) {
            console.log(`[MANAGER] DELETE-RESTAURANT FAIL - Manager: ${req.user.name}, RestaurantId: ${restaurantId}, Reason: Restaurant not found`);
            return res.redirect('/error?errorMsg=' + encodeURIComponent('Restaurant not found.'));
        }

        // Delete all reviews for this restaurant
        await Review.deleteMany({ restoId: restaurantId });

        // Delete restaurant
        await Resto.deleteOne({ _id: restaurantId });

        console.log(`[MANAGER] DELETE-RESTAURANT SUCCESS - Manager: ${req.user.name}, Deleted restaurant ${resto.name}`);
        return res.redirect(`/profile/id/${req.user.name}?success=Restaurant deleted successfully`);
    } catch (err) {
        console.error(`[MANAGER] DELETE-RESTAURANT ERROR - Manager: ${req.user.name}, Error: ${err.message}`);
        return res.redirect('/error?errorMsg=' + encodeURIComponent('Failed to delete restaurant.'));
    }
});

// POST /manager/unassign-restaurant - Reassign restaurant to different owner
router.post('/unassign-restaurant', async (req, res) => {
    try {
        const { restaurantId, newOwner } = req.body;

        if (!restaurantId || !newOwner) {
            console.log(`[MANAGER] REASSIGN-RESTAURANT FAIL - Manager: ${req.user.name}, Reason: Missing restaurant or new owner`);
            return res.redirect('/error?errorMsg=' + encodeURIComponent('Missing restaurant or new owner.'));
        }

        // Find restaurant
        const resto = await Resto.findById(restaurantId);
        if (!resto) {
            console.log(`[MANAGER] REASSIGN-RESTAURANT FAIL - Manager: ${req.user.name}, RestaurantId: ${restaurantId}, Reason: Restaurant not found`);
            return res.redirect('/error?errorMsg=' + encodeURIComponent('Restaurant not found.'));
        }

        // Find new owner user
        const newOwnerUser = await Profile.findOne({ name: newOwner });
        if (!newOwnerUser) {
            console.log(`[MANAGER] REASSIGN-RESTAURANT FAIL - Manager: ${req.user.name}, NewOwner: ${newOwner}, Reason: New owner not found`);
            return res.redirect('/error?errorMsg=' + encodeURIComponent('New owner not found.'));
        }

        // Get old owner info for logging
        const oldOwner = await Profile.findById(resto.owner);
        
        // Reassign restaurant to new owner
        resto.owner = newOwnerUser._id;
        await resto.save();

        console.log(`[MANAGER] REASSIGN-RESTAURANT SUCCESS - Manager: ${req.user.name}, Reassigned restaurant ${resto.name} from ${oldOwner?.name} to ${newOwner}`);
        return res.redirect(`/profile/id/${req.user.name}?success=Restaurant owner reassigned successfully`);
    } catch (err) {
        console.error(`[MANAGER] REASSIGN-RESTAURANT ERROR - Manager: ${req.user.name}, Error: ${err.message}`);
        return res.redirect('/error?errorMsg=' + encodeURIComponent('Failed to reassign restaurant owner.'));
    }
});

module.exports = router;
