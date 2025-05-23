import React, { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Container,
  Heading,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Text,
  Alert,
  AlertIcon,
  VStack,
  HStack,
  Stack,
  Spinner,
  useBreakpointValue,
  Input,
} from '@chakra-ui/react';
import axios from 'axios';

function SecurityGuards() {
  const [guards, setGuards] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [processingId, setProcessingId] = useState(null);
  const [formData, setFormData] = useState({ name: '', phone: '', password: '' });
  const [editingId, setEditingId] = useState(null);
  const isMobile = useBreakpointValue({ base: true, md: false });
  const [flats, setFlats] = useState([]);
  const testResidentPhone = '9535043493';
  const [testNotifLoading, setTestNotifLoading] = useState(false);
  const [testNotifResult, setTestNotifResult] = useState('');

  const fetchGuards = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await axios.get('/api/admin/security-guards');
      setGuards(res.data);
    } catch (err) {
      setError('Failed to fetch security guards');
    } finally {
      setLoading(false);
    }
  };

  const fetchFlats = async () => {
    try {
      const res = await axios.get('/api/admin/flats');
      setFlats(res.data);
    } catch (err) {
      console.error('Failed to fetch flats', err);
    }
  };

  useEffect(() => {
    fetchGuards();
    fetchFlats();
  }, []);

  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    try {
      if (editingId) {
        await axios.put(`/api/admin/security-guards/${editingId}`, formData);
        setSuccess('Security guard updated');
      } else {
        await axios.post('/api/admin/security-guards', formData);
        setSuccess('Security guard added');
      }
      setFormData({ name: '', phone: '', password: '' });
      setEditingId(null);
      fetchGuards();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save security guard');
    }
  };

  const handleEdit = (guard) => {
    setFormData({ name: guard.name, phone: guard.phone, password: '' });
    setEditingId(guard.id);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this security guard?')) return;
    setProcessingId(id);
    setError(''); setSuccess('');
    try {
      await axios.delete(`/api/admin/security-guards/${id}`);
      setSuccess('Security guard deleted');
      fetchGuards();
    } catch (err) {
      setError('Failed to delete security guard');
    } finally {
      setProcessingId(null);
    }
  };

  // Helper to get flat display string
  function getFlatDisplay(flat_id, flats) {
    const flat = flats.find(f => f.id === flat_id);
    if (!flat) return '-';
    return flat.unique_id || flat.number;
  }

  // Helper to send test notification
  const sendTestNotification = async () => {
    setTestNotifLoading(true);
    setTestNotifResult('');
    try {
      // Get resident user by phone
      const res = await axios.get(`/api/admin/users?phone=${testResidentPhone}`);
      const resident = res.data && res.data.length > 0 ? res.data[0] : null;
      if (!resident) {
        setTestNotifResult('Resident not found');
        setTestNotifLoading(false);
        return;
      }
      // Call backend to send test notification
      await axios.post('/api/fcm/test', {
        userId: resident.id,
        title: 'Test Notification',
        body: 'This is a test notification from security.'
      });
      setTestNotifResult('Test notification sent!');
    } catch (err) {
      setTestNotifResult('Failed to send test notification');
    } finally {
      setTestNotifLoading(false);
    }
  };

  return (
    <Container maxW="container.md" py={8}>
      <VStack spacing={6} align="stretch">
        <Heading size="lg" textAlign="center">Security Guard Management</Heading>
        {/* Test Notification Button */}
        <Box textAlign="center" mb={4}>
          <Button colorScheme="teal" onClick={sendTestNotification} isLoading={testNotifLoading}>
            Send Test Notification to Resident
          </Button>
          {testNotifResult && <Text mt={2}>{testNotifResult}</Text>}
        </Box>
        {error && <Alert status="error"><AlertIcon />{error}</Alert>}
        {success && <Alert status="success"><AlertIcon />{success}</Alert>}
        <Box as="form" onSubmit={handleSubmit} mb={4}>
          <Stack direction={{ base: 'column', md: 'row' }} spacing={2}>
            <Input
            type="text"
            name="name"
            placeholder="Name"
            value={formData.name}
            onChange={handleInputChange}
            required
          />
            <Input
            type="text"
            name="phone"
            placeholder="Phone"
            value={formData.phone}
            onChange={handleInputChange}
            required
          />
            <Input
            type="password"
            name="password"
            placeholder="Password"
            value={formData.password}
            onChange={handleInputChange}
            required={!editingId}
          />
            <Button type="submit" colorScheme="blue">
            {editingId ? 'Update' : 'Add'} Guard
            </Button>
          </Stack>
        </Box>
      {loading ? (
          <Box textAlign="center" py={10}><Spinner size="xl" /></Box>
      ) : guards.length === 0 ? (
          <Text color="gray.500" textAlign="center">No security guards found</Text>
        ) : isMobile ? (
          <VStack spacing={4} align="stretch">
            {guards.map((guard) => (
              <Box key={guard.id} p={4} borderWidth={1} borderRadius="lg" boxShadow="sm" bg="white">
                <Stack spacing={2}>
                  <Text fontWeight="bold">{guard.name}</Text>
                  <Text fontSize="sm" color="gray.600">Phone: {guard.phone}</Text>
                  <Text fontSize="sm" color="gray.600">Flat: {getFlatDisplay(guard.flat_id, flats)}</Text>
                  <HStack spacing={2} pt={2}>
                    <Button
                      colorScheme="yellow"
                      size="sm"
                    onClick={() => handleEdit(guard)}
                  >
                    Edit
                    </Button>
                    <Button
                      colorScheme="red"
                      size="sm"
                    onClick={() => handleDelete(guard.id)}
                      isLoading={processingId === guard.id}
                  >
                    {processingId === guard.id ? 'Deleting...' : 'Delete'}
                    </Button>
                  </HStack>
                </Stack>
              </Box>
            ))}
          </VStack>
        ) : (
          <Box overflowX="auto" bg="white" borderRadius="lg" boxShadow="sm">
            <Table variant="simple">
              <Thead bg="gray.50">
                <Tr>
                  <Th>Name</Th>
                  <Th>Phone</Th>
                  <Th>Flat</Th>
                  <Th>Actions</Th>
                </Tr>
              </Thead>
              <Tbody>
                {guards.map((guard) => (
                  <Tr key={guard.id}>
                    <Td>{guard.name}</Td>
                    <Td>{guard.phone}</Td>
                    <Td>{getFlatDisplay(guard.flat_id, flats)}</Td>
                    <Td>
                      <HStack spacing={2}>
                        <Button
                          colorScheme="yellow"
                          size="sm"
                          onClick={() => handleEdit(guard)}
                        >
                          Edit
                        </Button>
                        <Button
                          colorScheme="red"
                          size="sm"
                          onClick={() => handleDelete(guard.id)}
                          isLoading={processingId === guard.id}
                        >
                          {processingId === guard.id ? 'Deleting...' : 'Delete'}
                        </Button>
                      </HStack>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </Box>
        )}
      </VStack>
    </Container>
  );
}

export default SecurityGuards; 