// Apartment Management Routes
router.get('/apartments', auth, adminAuth, apartmentController.getAllApartments);
router.post('/apartments', auth, superAdminAuth, apartmentController.createApartment);
router.delete('/apartments/:id', auth, superAdminAuth, apartmentController.deleteApartment);

// Block Management Routes
router.get('/apartments/:apartmentId/blocks', auth, adminAuth, apartmentController.getBlocks);
router.post('/apartments/:apartmentId/blocks', auth, adminAuth, apartmentController.createBlock);
router.delete('/blocks/:id', auth, adminAuth, apartmentController.deleteBlock);

// Flat Management Routes
router.get('/blocks/:blockId/flats', auth, adminAuth, apartmentController.getFlats);
router.post('/blocks/:blockId/flats', auth, adminAuth, apartmentController.createFlat);
router.delete('/flats/:id', auth, adminAuth, apartmentController.deleteFlat);
router.post('/apartments/:apartmentId/flats', auth, adminAuth, apartmentController.createFlatForApartment); 