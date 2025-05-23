import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import {
  Box,
  Button,
  Container,
  Heading,
  Text,
  SimpleGrid,
  VStack,
  useBreakpointValue,
  Alert,
  AlertIcon,
} from '@chakra-ui/react';

const AdminPanel = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifStatus, setNotifStatus] = React.useState('');
  const [notifError, setNotifError] = React.useState('');

  const sendTestNotification = async () => {
    setNotifStatus('Sending...');
    setNotifError('');
    try {
      const response = await axios.post('/api/notifications/test', {
        userId: user?.id,
        title: 'Test Notification',
        body: 'This is a test notification from the Admin Panel.'
      });
      setNotifStatus('Notification sent!');
      console.log('[Test Notification] Success:', response.data);
    } catch (error) {
      setNotifStatus('Failed to send notification');
      setNotifError(
        JSON.stringify({
          message: error.message,
          response: error.response?.data,
          stack: error.stack
        }, null, 2)
      );
      console.error('[Test Notification] Error:', error);
    }
  };

  return (
    <Container maxW="container.lg" py={8}>
      <VStack spacing={6} align="stretch">
        <Heading size="lg" textAlign="center">Admin Dashboard</Heading>
        <Text color="gray.500" textAlign="center">Manage your gated community</Text>
        <SimpleGrid columns={{ base: 1, sm: 2, md: 2, lg: 3 }} spacing={6}>
          <Box bg="white" borderRadius="lg" boxShadow="sm" p={6}>
            <Heading size="md" mb={2}>Pending Users</Heading>
            <Text color="gray.600" fontSize="sm">Review and approve new user registrations</Text>
            <Button mt={4} colorScheme="blue" width="full" onClick={() => navigate('/admin/pending-users')}>
                  View Pending Users
            </Button>
          </Box>
          <Box bg="white" borderRadius="lg" boxShadow="sm" p={6}>
            <Heading size="md" mb={2}>Apartment Management</Heading>
            <Text color="gray.600" fontSize="sm">Create, edit, or remove blocks and flats</Text>
            <Button mt={4} colorScheme="blue" width="full" onClick={() => navigate('/admin/apartment-management')}>
                  Apartment Management
            </Button>
          </Box>
          <Box bg="white" borderRadius="lg" boxShadow="sm" p={6}>
            <Heading size="md" mb={2}>Security Guards</Heading>
            <Text color="gray.600" fontSize="sm">Manage security guard accounts</Text>
            <Button mt={4} colorScheme="blue" width="full" onClick={() => navigate('/admin/security-guards')}>
                  Security Guards
            </Button>
          </Box>
          <Box bg="white" borderRadius="lg" boxShadow="sm" p={6}>
            <Heading size="md" mb={2}>Visitor Log</Heading>
            <Text color="gray.600" fontSize="sm">View and manage visitor check-ins</Text>
            <Button mt={4} colorScheme="blue" width="full" onClick={() => navigate('/visitor-log')}>
                  View Visitor Log
            </Button>
          </Box>
        </SimpleGrid>
        <Box mt={6}>
          <Button
            colorScheme="green"
            width="full"
            mb={2}
            onClick={sendTestNotification}
          >
            Send Test Notification
          </Button>
          {notifStatus && <Text textAlign="center" fontSize="sm">{notifStatus}</Text>}
          {notifError && <Alert status="error" mt={2}><AlertIcon /><pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{notifError}</pre></Alert>}
          <Button
            variant="outline"
            colorScheme="gray"
            width="full"
            onClick={() => navigate('/dashboard')}
          >
            Back to Dashboard
          </Button>
        </Box>
      </VStack>
    </Container>
  );
};

export default AdminPanel; 