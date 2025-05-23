import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Container,
  FormControl,
  FormLabel,
  Input,
  Select,
  VStack,
  Heading,
  Text,
  useToast,
  Spinner,
  Alert,
  AlertIcon,
  FormHelperText,
} from '@chakra-ui/react';
import axios from 'axios';

const Register = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [apartments, setApartments] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [flats, setFlats] = useState([]);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    password: '',
    role: 'resident',
    apartment_id: '',
    block_id: '',
    flat_id: ''
  });
  const [error, setError] = useState('');

  // Fetch apartments on component mount
  useEffect(() => {
    const fetchApartments = async () => {
      try {
        const response = await axios.get('http://localhost:3001/api/apartments');
        setApartments(response.data);
      } catch (error) {
        console.error('Error fetching apartments:', error);
        toast({
          title: 'Error',
          description: 'Failed to load apartments. Please try again.',
          status: 'error',
          duration: 5000,
          isClosable: true,
        });
      }
    };
    fetchApartments();
  }, [toast]);

  // Fetch blocks when apartment is selected
  useEffect(() => {
    const fetchBlocks = async () => {
      if (!formData.apartment_id) {
        setBlocks([]);
        return;
      }
      try {
        // Use the new public endpoint
        const response = await axios.get(`http://localhost:3001/api/blocks?apartment_id=${formData.apartment_id}`);
        setBlocks(response.data);
      } catch (error) {
        console.error('Error fetching blocks:', error);
        toast({
          title: 'Error',
          description: 'Failed to load blocks. Please try again.',
          status: 'error',
          duration: 5000,
          isClosable: true,
        });
      }
    };
    fetchBlocks();
  }, [formData.apartment_id, toast]);

  // Fetch flats when apartment or block is selected
  useEffect(() => {
    const fetchFlats = async () => {
      if (!formData.apartment_id) {
        setFlats([]);
        return;
      }
      try {
        // Use the new public endpoint
        const response = await axios.get(`http://localhost:3001/api/flats?apartment_id=${formData.apartment_id}`);
        // Filter flats based on block_id if selected
        const filteredFlats = formData.block_id 
          ? response.data.filter(flat => flat.block_id === parseInt(formData.block_id))
          : response.data.filter(flat => !flat.block_id);
        setFlats(filteredFlats);
      } catch (error) {
        console.error('Error fetching flats:', error);
        toast({
          title: 'Error',
          description: 'Failed to load flats. Please try again.',
          status: 'error',
          duration: 5000,
          isClosable: true,
        });
      }
    };
    fetchFlats();
  }, [formData.apartment_id, formData.block_id, toast]);

  const handleApartmentChange = async (e) => {
    const apartmentId = e.target.value;
    setFormData(prev => ({ 
      ...prev, 
      apartment_id: apartmentId, 
      block_id: '', // Reset block when apartment changes
      flat_id: ''   // Reset flat when apartment changes
    }));
  };

  const handleBlockChange = (e) => {
    const blockId = e.target.value;
    setFormData(prev => ({ 
      ...prev, 
      block_id: blockId,
      flat_id: '' // Reset flat when block changes
    }));
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
      // Reset dependent fields when parent field changes
      ...(name === 'apartment_id' && { block_id: '', flat_id: '' }),
      ...(name === 'block_id' && { flat_id: '' })
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Prepare the registration data
      const registrationData = {
        ...formData,
        // Convert string IDs to integers
        apartment_id: formData.apartment_id ? parseInt(formData.apartment_id) : null,
        flat_id: formData.flat_id ? parseInt(formData.flat_id) : null,
        block_id: formData.block_id ? parseInt(formData.block_id) : null
      };

      console.log('Registration data:', registrationData); // Debug log

      const response = await axios.post('http://localhost:3001/api/auth/register', registrationData);
      
      toast({
        title: 'Registration Successful',
        description: response.data.message,
        status: 'success',
        duration: 5000,
        isClosable: true,
      });

      // Redirect to login page
      navigate('/login');
    } catch (error) {
      console.error('Registration error:', error.response?.data);
      setError(error.response?.data?.error || 'An error occurred during registration');
      toast({
        title: 'Registration Failed',
        description: error.response?.data?.error || 'An error occurred during registration',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setLoading(false);
    }
  };

  // Helper to check if blocks exist for the selected apartment
  const hasBlocks = blocks.length > 0;

  return (
    <Container maxW="container.sm" py={10}>
      <VStack spacing={8} align="stretch">
        <Heading textAlign="center">Register</Heading>
        
        <Alert status="info">
          <AlertIcon />
          <Text>After registration, your account will need admin approval before you can log in.</Text>
        </Alert>

        <form onSubmit={handleSubmit}>
          <VStack spacing={4}>
            <FormControl isRequired>
              <FormLabel>Name</FormLabel>
              <Input
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="Enter your name"
              />
            </FormControl>

            <FormControl isRequired>
              <FormLabel>Phone Number</FormLabel>
              <Input
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                placeholder="Enter your phone number"
                type="tel"
              />
            </FormControl>

            <FormControl isRequired>
              <FormLabel>Password</FormLabel>
              <Input
                name="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="Enter your password"
                type="password"
              />
            </FormControl>

            <FormControl isRequired>
              <FormLabel>Role</FormLabel>
              <Select
                name="role"
                value={formData.role}
                onChange={handleChange}
              >
                <option value="resident">Resident</option>
                <option value="security">Security Guard</option>
              </Select>
            </FormControl>

            {formData.role === 'resident' && (
              <>
                <FormControl isRequired>
                  <FormLabel>Apartment</FormLabel>
                  <Select
                    name="apartment_id"
                    value={formData.apartment_id}
                    onChange={handleApartmentChange}
                    placeholder="Select apartment"
                  >
                    {apartments.map(apartment => (
                      <option key={apartment.id} value={apartment.id}>
                        {apartment.name}
                      </option>
                    ))}
                  </Select>
                </FormControl>

                {/* Only show block selection if blocks exist for the apartment */}
                {hasBlocks && (
                  <FormControl>
                    <FormLabel>Block (Optional)</FormLabel>
                    <Select
                      name="block_id"
                      value={formData.block_id}
                      onChange={handleBlockChange}
                      placeholder="Select block"
                    >
                      <option value="">No Block</option>
                      {blocks.map(block => (
                        <option key={block.id} value={block.id}>
                          {block.name}
                        </option>
                      ))}
                    </Select>
                  </FormControl>
                )}

                {formData.apartment_id && (
                  <FormControl isRequired>
                    <FormLabel>Flat</FormLabel>
                    <Select
                      name="flat_id"
                      value={formData.flat_id}
                      onChange={handleChange}
                      placeholder="Select flat"
                      isDisabled={flats.length === 0}
                    >
                      {flats.map(flat => (
                        <option key={flat.id} value={flat.id}>
                          {flat.unique_id || flat.number}
                        </option>
                      ))}
                    </Select>
                    {flats.length === 0 && (
                      <FormHelperText color="red.500">
                        No flats available for this apartment
                      </FormHelperText>
                    )}
                  </FormControl>
                )}
              </>
            )}

            {(!formData.name || !formData.phone || !formData.password || (formData.role === 'resident' && (!formData.apartment_id || !formData.flat_id))) && (
              <Box color="red.500" fontSize="sm" textAlign="center">
                { !formData.name && 'Name is required. '}
                { !formData.phone && 'Phone is required. '}
                { !formData.password && 'Password is required. '}
                { formData.role === 'resident' && !formData.apartment_id && 'Apartment is required. '}
                { formData.role === 'resident' && !formData.flat_id && 'Flat is required. '}
              </Box>
            )}

            <Button
              type="submit"
              colorScheme="blue"
              width="full"
              isLoading={loading}
              loadingText="Registering..."
              disabled={
                !formData.name ||
                !formData.phone ||
                !formData.password ||
                (formData.role === 'resident' && (!formData.apartment_id || !formData.flat_id))
              }
            >
              Register
            </Button>

            <Text textAlign="center">
              Already have an account?{' '}
              <Button
                variant="link"
                colorScheme="blue"
                onClick={() => navigate('/login')}
              >
                Login
              </Button>
            </Text>
          </VStack>
        </form>
      </VStack>
    </Container>
  );
};

export default Register; 