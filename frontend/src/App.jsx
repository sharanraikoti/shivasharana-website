import { BrowserRouter, Route, Routes } from "react-router-dom";
import { PublicLayout } from "./components/Layout";
import StaffLayout from "./components/StaffLayout";
import { ButtonLink } from "./components/ui";
import { AuthProvider, ShopProvider, useTitle } from "./lib/hooks";
import Companies from "./pages/Companies";
import CompanyStock from "./pages/CompanyStock";
import Home from "./pages/Home";
import QrPage from "./pages/QrPage";
import Billing from "./pages/staff/Billing";
import Bills from "./pages/staff/Bills";
import Dashboard from "./pages/staff/Dashboard";
import ImportData from "./pages/staff/ImportData";
import Inventory from "./pages/staff/Inventory";
import Login from "./pages/staff/Login";
import Purchases from "./pages/staff/Purchases";
import ShopDetails from "./pages/staff/ShopDetails";
import StaffQr from "./pages/staff/StaffQr";
import Users from "./pages/staff/Users";

export default function App() {
  return (
    <BrowserRouter>
      <ShopProvider>
        <AuthProvider>
          <Routes>
            <Route element={<PublicLayout />}>
              <Route index element={<Home />} />
              <Route path="companies" element={<Companies />} />
              <Route path="companies/:slug" element={<CompanyStock />} />
              <Route path="qr" element={<QrPage />} />
              <Route path="*" element={<NotFound />} />
            </Route>
            <Route path="staff/login" element={<Login />} />
            <Route path="staff" element={<StaffLayout />}>
              <Route index element={<Dashboard />} />
              <Route path="billing" element={<Billing />} />
              <Route path="bills" element={<Bills />} />
              <Route path="inventory" element={<Inventory />} />
              <Route path="purchases" element={<Purchases />} />
              <Route path="import" element={<ImportData />} />
              <Route path="shop" element={<ShopDetails />} />
              <Route path="users" element={<Users />} />
              <Route path="qr" element={<StaffQr />} />
            </Route>
          </Routes>
        </AuthProvider>
      </ShopProvider>
    </BrowserRouter>
  );
}

function NotFound() {
  useTitle("Page not found");
  return (
    <div className="mx-auto max-w-xl px-4 py-20 text-center">
      <h1 className="text-2xl font-bold text-ink">Page not found</h1>
      <p className="mt-2 text-ink-soft">The link may be wrong or the page has moved.</p>
      <ButtonLink to="/" className="mt-6">
        Go to the home page
      </ButtonLink>
    </div>
  );
}
