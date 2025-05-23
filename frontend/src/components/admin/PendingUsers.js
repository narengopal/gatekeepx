import React, { useState, useEffect } from 'react';
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
  useToast,
  Text,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  useDisclosure,
} from '@chakra-ui/react';
import axios from 'axios';
import { useRef } from 'react';
import { io } from 'socket.io-client';

const PendingUsers = () => {
  const [pendingUsers, setPendingUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState(null);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const toast = useToast();
  const socketRef = useRef(null);

  const fetchPendingUsers = async () => {
    try {
      const response = await axios.get('http://localhost:3001/api/admin/pending-users', {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`
        }
      });
      setPendingUsers(response.data);
    } catch (error) {
      console.error('Error fetching pending users:', error);
      toast({
        title: 'Error',
        description: 'Failed to load pending users',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPendingUsers();
  }, []);

  // Listen for socket events
  useEffect(() => {
    // Setup socket connection
    const socket = io('http://localhost:3001', { transports: ['websocket'] });
    socketRef.current = socket;

    // Listen for refresh_pending_users event
    socket.on('refresh_pending_users', () => {
      console.log('[Socket Debug] Received refresh_pending_users event in PendingUsers component');
      fetchPendingUsers();
    });

    // Clean up on unmount
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  const handleApprove = async (userId) => {
    try {
      await axios.post(
        `http://localhost:3001/api/admin/approve-user/${userId}`,
        {},
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`
          }
        }
      );

      toast({
        title: 'Success',
        description: 'User approved successfully',
        status: 'success',
        duration: 5000,
        isClosable: true,
      });

      // Refresh the list
      fetchPendingUsers();
    } catch (error) {
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'Failed to approve user',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    }
  };

  const handleReject = async (userId) => {
    try {
      await axios.delete(
        `http://localhost:3001/api/admin/reject-user/${userId}`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`
          }
        }
      );

      toast({
        title: 'Success',
        description: 'User rejected successfully',
        status: 'success',
        duration: 5000,
        isClosable: true,
      });

      // Refresh the list
      fetchPendingUsers();
      onClose();
    } catch (error) {
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'Failed to reject user',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    }
  };

  const openRejectModal = (user) => {
    setSelectedUser(user);
    onOpen();
  };

  if (loading) {
    return (
      <Container maxW="container.xl" py={10}>
        <Text>Loading...</Text>
      </Container>
    );
  }

  return (
    <Container maxW="container.xl" py={10}>
      <Heading mb={6}>Pending User Approvals</Heading>

      {pendingUsers.length === 0 ? (
        <Alert status="info">
          <AlertIcon />
          <AlertTitle>No pending users!</AlertTitle>
          <AlertDescription>
            There are no users waiting for approval at the moment.
          </AlertDescription>
        </Alert>
      ) : (
        <Box overflowX="auto">
          <Table variant="simple">
            <Thead>
              <Tr>
                <Th>Name</Th>
                <Th>Phone</Th>
                <Th>Apartment</Th>
                <Th>Flat</Th>
                <Th>Registered On</Th>
                <Th>Actions</Th>
              </Tr>
            </Thead>
            <Tbody>
              {pendingUsers.map((user) => (
                <Tr key={user.id}>
                  <Td>{user.name}</Td>
                  <Td>{user.phone}</Td>
                  <Td>{user.apartment?.name || 'N/A'}</Td>
                  <Td>{user.flat?.number || 'N/A'}</Td>
                  <Td>{new Date(user.created_at).toLocaleDateString()}</Td>
                  <Td>
                    <Button
                      colorScheme="green"
                      size="sm"
                      mr={2}
                      onClick={() => handleApprove(user.id)}
                    >
                      Approve
                    </Button>
                    <Button
                      colorScheme="red"
                      size="sm"
                      onClick={() => openRejectModal(user)}
                    >
                      Reject
                    </Button>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </Box>
      )}

      {/* Reject Confirmation Modal */}
      <Modal isOpen={isOpen} onClose={onClose}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Reject User Registration</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            Are you sure you want to reject {selectedUser?.name}'s registration?
            This action cannot be undone.
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={onClose}>
              Cancel
            </Button>
            <Button
              colorScheme="red"
              onClick={() => handleReject(selectedUser?.id)}
            >
              Reject
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Container>
  );
};

export default PendingUsers; 