import { Link, useLocation } from 'react-router-dom';
import { BuildingOfficeIcon } from '@heroicons/react/24/outline';
import { HomeIcon } from '@heroicons/react/24/outline';

function Navigation({ user }) {
  const location = useLocation();

  return (
    <nav>
      {(user?.role === 'admin' || user?.role === 'super_admin') && (
        <>
          <Link
            to="/admin"
            className={`flex items-center px-4 py-2 text-sm ${
              location.pathname === '/admin'
                ? 'bg-indigo-50 text-indigo-600'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <HomeIcon className="mr-3 h-6 w-6" />
            Admin Panel
          </Link>
          <Link
            to="/admin/apartment-management"
            className={`flex items-center px-4 py-2 text-sm ${
              location.pathname === '/admin/apartment-management'
                ? 'bg-indigo-50 text-indigo-600'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <BuildingOfficeIcon className="mr-3 h-6 w-6" />
            Apartment Management
          </Link>
        </>
      )}
    </nav>
  );
}

export default Navigation; 