# ADC MÓVEIS E ELETROS

This is a Next.js application for an online sales system with an online catalog and installment payment options.

## Features

- **Product Catalog**: Browse products with filtering and sorting.
- **Shopping Cart**: Add products, update quantities, and checkout.
- **Customer Registration**: A simple customer registration form during checkout.
- **Admin Customer Registry**: Customer table stored in Firestore (`customers`) with full address fields.
- **Customer Trash (Recycle Bin)**: Deleted customer records are moved to `customersTrash` and can be restored by authorized users.
- **Installment Payments**: A unique "Crediário" system allowing customers to pay in installments.
- **Order Confirmation**: A confirmation page summarizing the order details.

This project is built with Next.js, TypeScript, and Tailwind CSS, utilizing shadcn/ui for components.

## Customer Registry + Trash

- **Main table**: new customer registrations go to `customers` (they are not created inside the trash).
- **Recycle bin**: deletions move the record from `customers` to `customersTrash` with deletion metadata.
- **Access control**: only `admin` and `gerente` can access and restore from the customer trash.
- **Audit logs**: operations that move/restore customer records from the trash are logged via the audit system.
