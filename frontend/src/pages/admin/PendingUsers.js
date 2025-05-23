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
  Badge,
  Text,
  Alert,
  AlertIcon,
  useBreakpointValue,
  VStack,
  HStack,
  Stack,
  Spinner,
} from '@chakra-ui/react';
import axios from 'axios';

function PendingUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [processingId, setProcessingId] = useState(null);
  const isMobile = useBreakpointValue({ base: true, md: false });
  const [flats, setFlats] = useState([]);

  const fetchUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await axios.get('/api/admin/users');
      setUsers(res.data);
    } catch (err) {
      setError('Failed to fetch users');
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
    fetchUsers();
    fetchFlats();
  }, []);

  const handleApprove = async (userId) => {
    setProcessingId(userId);
    setError(''); setSuccess('');
    try {
      await axios.post(`/api/admin/approve-user/${userId}`);
      setSuccess('User approved');
      fetchUsers();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to approve user');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (userId) => {
    if (!window.confirm('Reject and delete this user?')) return;
    setProcessingId(userId);
    setError(''); setSuccess('');
    try {
      await axios.delete(`/api/admin/reject-user/${userId}`);
      setSuccess('User rejected and deleted');
      fetchUsers();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to reject user');
    } finally {
      setProcessingId(null);
    }
  };

  const handleDelete = async (userId) => {
    if (!window.confirm('Delete this user?')) return;
    setProcessingId(userId);
    setError(''); setSuccess('');
    try {
      await axios.delete(`/api/admin/users/${userId}`);
      setSuccess('User deleted');
      fetchUsers();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete user');
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

  return (
    <Container maxW="container.lg" py={8}>
      <VStack spacing={6} align="stretch">
        <Heading size="lg" textAlign="center">User Approvals & Management</Heading>
        {error && <Alert status="error"><AlertIcon />{error}</Alert>}
        {success && <Alert status="success"><AlertIcon />{success}</Alert>}
        {loading ? (
          <Box textAlign="center" py={10}><Spinner size="xl" /></Box>
        ) : users.length === 0 ? (
          <Text color="gray.500" textAlign="center">No users found</Text>
        ) : isMobile ? (
          <VStack spacing={4} align="stretch">
            {users.map((user) => (
              <Box key={user.id} p={4} borderWidth={1} borderRadius="lg" boxShadow="sm" bg="white">
                <Stack spacing={2}>
                  <HStack justify="space-between">
                    <Text fontWeight="bold">{user.name}</Text>
                    <Badge colorScheme={user.is_approved ? 'green' : 'yellow'}>
                      {user.is_approved ? 'Approved' : 'Pending'}
                    </Badge>
                  </HStack>
                  <Text fontSize="sm" color="gray.600">Phone: {user.phone}</Text>
                  <Text fontSize="sm" color="gray.600">Role: {user.role}</Text>
                  <Text fontSize="sm" color="gray.600">Flat: {getFlatDisplay(user.flat_id, flats)}</Text>
                  <HStack spacing={2} pt={2}>
                    {!user.is_approved && user.role === 'resident' && (
                      <Button
                        colorScheme="green"
                        size="sm"
                        onClick={() => handleApprove(user.id)}
                        isLoading={processingId === user.id}
                        flex={1}
                      >
                        Approve
                      </Button>
                    )}
                    {!user.is_approved && user.role === 'resident' && (
                      <Button
                        colorScheme="red"
                        size="sm"
                        onClick={() => handleReject(user.id)}
                        isLoading={processingId === user.id}
                        flex={1}
                      >
                        Reject
                      </Button>
                    )}
                    <Button
                      colorScheme="gray"
                      size="sm"
                      onClick={() => handleDelete(user.id)}
                      isLoading={processingId === user.id}
                      flex={1}
                    >
                      Delete
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
                  <Th>Role</Th>
                  <Th>Flat</Th>
                  <Th>Status</Th>
                  <Th>Actions</Th>
                </Tr>
              </Thead>
              <Tbody>
                {users.map((user) => (
                  <Tr key={user.id}>
                    <Td>{user.name}</Td>
                    <Td>{user.phone}</Td>
                    <Td>{user.role}</Td>
                    <Td>{getFlatDisplay(user.flat_id, flats)}</Td>
                    <Td>
                      <Badge colorScheme={user.is_approved ? 'green' : 'yellow'}>
                        {user.is_approved ? 'Approved' : 'Pending'}
                      </Badge>
                    </Td>
                    <Td>
                      <HStack spacing={2}>
                        {!user.is_approved && user.role === 'resident' && (
                          <Button
                            colorScheme="green"
                            size="sm"
                            onClick={() => handleApprove(user.id)}
                            isLoading={processingId === user.id}
                          >
                            Approve
                          </Button>
                        )}
                        {!user.is_approved && user.role === 'resident' && (
                          <Button
                            colorScheme="red"
                            size="sm"
                            onClick={() => handleReject(user.id)}
                            isLoading={processingId === user.id}
                          >
                            Reject
                          </Button>
                        )}
                        <Button
                          colorScheme="gray"
                          size="sm"
                          onClick={() => handleDelete(user.id)}
                          isLoading={processingId === user.id}
                        >
                          Delete
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

export default PendingUsers; 